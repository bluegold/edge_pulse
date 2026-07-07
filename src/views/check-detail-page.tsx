import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import type { CheckDetailData as CheckDetailDataType } from "../store/check-detail";
import { LocalTime, formatLocalDateTime } from "./time.tsx";
import { formatNullable } from "../presenters/common";
import { describeCheckState, describeCertificateBadge, describeMaintenanceBadge } from "../presenters/checks";
import { formatDuration } from "../presenters/dashboard";
import { calculateCertificateDaysRemaining } from "../lib/checks";
import type { CloudflareAccessIdentity } from "../http/shared";
import type { Child } from "hono/jsx";

export type CheckDetailData = CheckDetailDataType;

type TimingPoint = {
  checkedAt: string;
  label: string;
  state: "ok" | "fail";
  statusCode: number | null;
  latencyMs: number | null;
  runtimeMs: number | null;
  error: string | null;
  serverTimingSummary: string;
};

const formatTimingMs = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "-";
  return `${Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "")}ms`;
};

const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
};

const extractIssuerCn = (value: string | null | undefined): string => {
  if (!value) return "-";
  const match = value.match(/(?:^|,)\s*CN=([^,]+)/i);
  return match?.[1]?.trim() || value;
};

const parseServerTimingSummary = (value: string | null | undefined): string => {
  if (!value) return "-";

  try {
    const parsed = JSON.parse(value) as Array<{ name?: string; durationMs?: number | null; description?: string | null }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return "-";
    return parsed
      .slice(0, 3)
      .map((entry) => `${entry.name ?? "timing"} ${formatTimingMs(entry.durationMs ?? null)}`)
      .join(" / ");
  } catch {
    return "-";
  }
};

const DetailCard = ({
  title,
  children,
  id,
  padded = true,
}: {
  title?: string;
  children: Child;
  id: string;
  padded?: boolean;
}) => (
  <section id={id} class={`panel ${padded ? "panel-pad" : "p-0"}`}>
    {title ? <h2 class={`panel-title text-lg font-black tracking-tight ${padded ? "" : "px-6 pt-6"}`}>{title}</h2> : null}
    <div class={padded ? "mt-4" : ""}>{children}</div>
  </section>
);

const MetricBox = ({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" | "danger" }) => (
  <div class={`rounded-md border p-4 ${tone === "ok" ? "border-emerald-400/20 bg-emerald-500/8" : tone === "warn" ? "border-amber-400/20 bg-amber-500/8" : tone === "danger" ? "border-rose-400/20 bg-rose-500/8" : "border-white/10 bg-white/5"}`}>
    <p class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{label}</p>
    <p class="mt-2 text-right text-2xl font-black tracking-tight tabular-nums text-slate-50">{value}</p>
  </div>
);

const ReportMetricCard = ({
  id,
  label,
  value,
  tone = "default",
  icon,
}: {
  id: string;
  label: string;
  value: string | number | null;
  tone?: "default" | "danger";
  icon: Child;
}) => (
  <article id={id} class={`metric-card block p-5 ${tone === "danger" ? "danger" : ""}`}>
    <div class="flex h-full flex-col justify-between gap-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-bold tracking-wide text-slate-200">{label}</p>
        </div>
        <span class={`metric-icon grid h-12 w-12 place-items-center rounded-md border border-white/10 bg-white/5 ${tone === "danger" ? "text-rose-200" : "text-sky-200"}`}>{icon}</span>
      </div>
      <p class="mt-auto self-end pb-1 text-right text-3xl font-black tracking-tight text-slate-50">{formatNullable(value)}</p>
    </div>
  </article>
);

const buildGraphPoints = (results: CheckDetailData["recentResults"]): TimingPoint[] => {
  return results
    .slice()
    .reverse()
    .map((result) => ({
      checkedAt: result.checked_at,
      label: formatLocalDateTime(new Date(result.checked_at)),
      state: result.state,
      statusCode: result.status_code,
      latencyMs: result.latency_ms,
      runtimeMs: result.x_runtime_ms ?? null,
      error: result.error,
      serverTimingSummary: parseServerTimingSummary(result.server_timing_json),
    }));
};

const GraphCard = ({
  title,
  metric,
  points,
  emptyLabel,
}: {
  title: string;
  metric: "latency" | "runtime";
  points: TimingPoint[];
  emptyLabel: string;
}) => (
  <figure
    class="graph-card rounded-md border border-white/10 bg-white/5 p-4"
    data-check-graph
    data-title={title}
    data-metric={metric}
    data-points={JSON.stringify(points)}
  >
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-sm font-bold tracking-wide text-slate-200">{title}</h3>
      <span class="text-xs text-slate-400">過去24H</span>
    </div>
    <div class="graph-shell mt-4">
      <div class="graph-frame" data-role="graph-frame">
        <div class="graph-empty text-sm text-slate-400">{emptyLabel}</div>
      </div>
      <div class="graph-tooltip" data-role="graph-tooltip" hidden></div>
    </div>
  </figure>
);

const SettingsSection = ({ data }: { data: CheckDetailData }) => (
  <DetailCard id="check-settings">
    <dl class="flex flex-wrap justify-between gap-4">
      <div class="w-full max-w-[16rem] flex-1">
        <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">成功 HTTP</dt>
        <dd class="mt-1 text-right text-base font-semibold tabular-nums text-slate-50">{data.check.expected_status_min} 〜 {data.check.expected_status_max}</dd>
      </div>
      <div class="w-full max-w-[11rem] flex-1">
        <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">timeout</dt>
        <dd class="mt-1 text-right text-base font-semibold tabular-nums text-slate-50">{data.check.timeout_ms}ms</dd>
      </div>
      <div class="w-full max-w-[10rem] flex-1">
        <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">間隔</dt>
        <dd class="mt-1 text-right text-base font-semibold tabular-nums text-slate-50">{data.check.interval_minutes} 分</dd>
      </div>
      <div class="w-full max-w-[16rem] flex-1">
        <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">メンテ</dt>
        <dd class="mt-1 text-right text-base font-semibold text-slate-50">
          <span class="whitespace-nowrap">{data.check.maintenance_enabled ? "有効" : "無効"}</span>
        </dd>
      </div>
    </dl>
  </DetailCard>
);

const ReportSection = ({ data }: { data: CheckDetailData }) => {
  const recentResult = data.recentResults[0] ?? null;
  const certificateDaysRemaining = calculateCertificateDaysRemaining(data.check.tls_valid_to);
  const errorDetails =
    recentResult?.state === "fail"
      ? [formatNullable(recentResult.status_code), formatTimingMs(recentResult.latency_ms), recentResult.error ?? "-"]
          .filter((part) => part !== "-")
          .join(" / ") || "-"
      : null;

  return (
    <DetailCard id="check-report" padded={false}>
      <div class="grid gap-px border-b border-slate-700/30 bg-slate-700/20 p-px sm:grid-cols-2 xl:grid-cols-6">
        <ReportMetricCard
          id="summary-report-cert-days-remaining"
          label="証明書残日数"
          value={formatNullable(certificateDaysRemaining)}
          tone={certificateDaysRemaining !== null && certificateDaysRemaining <= 30 ? "danger" : "default"}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h10"/><path d="M7 21h10"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h2"/><path d="M12 17.5 9.5 16l2.5-1.5 2.5 1.5Z"/></svg>}
        />
        <ReportMetricCard
          id="summary-report-failures-24h"
          label="24h 障害"
          value={data.report.failures24h}
          tone={data.report.failures24h > 0 ? "danger" : "default"}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4"/><path d="M12 16h.01"/><path d="m10.29 3.86-8.1 14.06A2 2 0 0 0 4.03 21h15.94a2 2 0 0 0 1.84-3.08l-8.1-14.06a2 2 0 0 0-3.42 0Z"/></svg>}
        />
        <ReportMetricCard
          id="summary-report-average-latency"
          label="平均遅延"
          value={formatTimingMs(data.report.avgLatencyMs)}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h3l2-5 4 10 2-5h5"/></svg>}
        />
        <ReportMetricCard
          id="summary-report-average-xruntime"
          label="平均 X-Runtime"
          value={formatTimingMs(data.report.avgRuntimeMs)}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>}
        />
        <ReportMetricCard
          id="summary-report-availability-24h"
          label="24h 可用率"
          value={formatPercent(data.report.availability24h)}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M5 8h14"/><path d="M7 16h10"/></svg>}
        />
        <ReportMetricCard
          id="summary-report-detail"
          label="詳細"
          value={errorDetails ?? "-"}
          tone={recentResult?.state === "fail" ? "danger" : "default"}
          icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4"/><path d="M12 16h.01"/></svg>}
        />
      </div>
    </DetailCard>
  );
};

const GraphSection = ({ data }: { data: CheckDetailData }) => {
  const latencyPoints = buildGraphPoints(data.recentResults);
  const runtimePoints = buildGraphPoints(data.recentResults);

  return (
    <DetailCard id="check-graphs" padded={false}>
      <div class="grid gap-4 xl:grid-cols-2">
        <GraphCard title="遅延の推移" metric="latency" points={latencyPoints} emptyLabel="遅延データがまだありません。" />
        <GraphCard title="X-Runtime の推移" metric="runtime" points={runtimePoints} emptyLabel="X-Runtime データがまだありません。" />
      </div>
    </DetailCard>
  );
};

const CertificateSection = ({ data }: { data: CheckDetailData }) => {
  const badge = describeCertificateBadge(data.check);
  const issuerCn = extractIssuerCn(data.check.tls_issuer);
  const issuerTitle = data.check.tls_issuer ?? "-";
  return (
    <DetailCard title="証明書情報" id="check-certificate">
      <div class="grid gap-4 xl:grid-cols-3">
        <div class="rounded-md border border-white/10 bg-white/5 p-4">
          <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">有効期限</dt>
          <dd class="mt-1 text-right text-2xl font-black tracking-tight text-slate-50">
            {data.check.tls_valid_to ? <LocalTime iso={data.check.tls_valid_to} class="whitespace-nowrap" /> : "-"}
          </dd>
        </div>
        <div class="rounded-md border border-white/10 bg-white/5 p-4">
          <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Issuer CN</dt>
          <dd class="mt-1 text-right text-lg font-semibold text-slate-50">
            <span title={issuerTitle} class="block truncate">
              {issuerCn}
            </span>
          </dd>
        </div>
        <div class="rounded-md border border-white/10 bg-white/5 p-4">
          <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">最終チェック日時・結果</dt>
          <dd class="mt-1 text-right text-base font-semibold text-slate-50">
            <div class="flex flex-col items-end gap-2">
              <span class="whitespace-nowrap">
                {data.check.tls_last_checked_at ? <LocalTime iso={data.check.tls_last_checked_at} class="whitespace-nowrap" /> : "-"}
              </span>
              <span class={badge.className}>{badge.label}</span>
            </div>
          </dd>
        </div>
        {data.check.tls_last_error ? (
          <div class="xl:col-span-3 rounded-md border border-rose-400/20 bg-rose-500/8 p-4">
            <dt class="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">エラー</dt>
            <dd class="mt-1 break-words text-base font-semibold text-rose-100">{data.check.tls_last_error}</dd>
          </div>
        ) : null}
      </div>
    </DetailCard>
  );
};

const EventsSection = ({ data }: { data: CheckDetailData }) => (
  <DetailCard title="状態遷移イベント" id="check-events">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th class="px-4 py-3 font-bold">遷移</th>
            <th class="px-4 py-3 font-bold">理由</th>
            <th class="px-4 py-3 font-bold">HTTP</th>
            <th class="px-4 py-3 font-bold">遅延</th>
            <th class="px-4 py-3 font-bold">時刻</th>
          </tr>
        </thead>
        <tbody class="align-top text-slate-300">
          {data.recentEvents.length > 0 ? (
            data.recentEvents.map((event) => (
              <tr id={`check-event-${event.id}`} class="transition hover:bg-white/5">
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-2">
                    <span class={`state-mark ${event.from_state === "fail" ? "fail" : ""}`}>{event.from_state === "fail" ? "×" : "✓"}</span>
                    →
                    <span class={`state-mark ${event.to_state === "fail" ? "fail" : ""}`}>{event.to_state === "fail" ? "×" : "✓"}</span>
                  </span>
                </td>
                <td class="px-4 py-2.5">{formatNullable(event.reason)}</td>
                <td class="px-4 py-2.5">{formatNullable(event.status_code)}</td>
                <td class="px-4 py-2.5">{formatTimingMs(event.latency_ms)}</td>
                <td class="px-4 py-2.5"><LocalTime iso={event.occurred_at} class="whitespace-nowrap" /></td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} class="px-4 py-6 text-sm text-slate-400">
                状態遷移イベントはまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </DetailCard>
);

const IncidentsSection = ({ data }: { data: CheckDetailData }) => (
  <DetailCard title="incident 履歴" id="check-incidents">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th class="px-4 py-3 font-bold">開始</th>
            <th class="px-4 py-3 font-bold">復旧</th>
            <th class="px-4 py-3 font-bold">継続</th>
            <th class="px-4 py-3 font-bold">開始理由</th>
            <th class="px-4 py-3 font-bold">終了理由</th>
          </tr>
        </thead>
        <tbody class="align-top text-slate-300">
          {data.recentIncidents.length > 0 ? (
            data.recentIncidents.map((incident) => (
              <tr id={`check-incident-${incident.id}`} class="transition hover:bg-white/5">
                <td class="px-4 py-2.5"><LocalTime iso={incident.started_at} class="whitespace-nowrap" /></td>
                <td class="px-4 py-2.5">{incident.resolved_at ? <LocalTime iso={incident.resolved_at} class="whitespace-nowrap" /> : "継続中"}</td>
                <td class="px-4 py-2.5">{formatDuration(incident.started_at, incident.resolved_at)}</td>
                <td class="px-4 py-2.5">{formatNullable(incident.start_reason)}</td>
                <td class="px-4 py-2.5">{formatNullable(incident.end_reason)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} class="px-4 py-6 text-sm text-slate-400">
                incident はまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </DetailCard>
);

const ResultsSection = ({ data }: { data: CheckDetailData }) => (
  // 表示は最近12件だけに絞る。グラフは同じ 24h データ全体を使う。
  <DetailCard title="直近のチェック結果" id="check-results">
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th class="px-4 py-3 font-bold">時刻</th>
            <th class="px-4 py-3 font-bold">状態</th>
            <th class="px-4 py-3 font-bold">HTTP</th>
            <th class="px-4 py-3 font-bold">遅延</th>
            <th class="px-4 py-3 font-bold">X-Runtime</th>
            <th class="px-4 py-3 font-bold">Server-Timing</th>
            <th class="px-4 py-3 font-bold">エラー</th>
          </tr>
        </thead>
        <tbody class="align-top text-slate-300">
          {data.recentResults.slice(0, 12).length > 0 ? (
            data.recentResults.slice(0, 12).map((result) => (
              <tr id={`check-result-${result.id}`} class="transition hover:bg-white/5">
                <td class="px-4 py-2.5"><LocalTime iso={result.checked_at} class="whitespace-nowrap" /></td>
                <td class="px-4 py-2.5">
                  <span class={`inline-flex items-center gap-2 ${result.state === "fail" ? "text-rose-300" : "text-emerald-300"}`}>
                    <span class={`result-mark ${result.state === "fail" ? "fail" : ""}`}>{result.state === "fail" ? "×" : "✓"}</span>
                    {result.state}
                  </span>
                </td>
                <td class="px-4 py-2.5">{formatNullable(result.status_code)}</td>
                <td class="px-4 py-2.5">{formatTimingMs(result.latency_ms)}</td>
                <td class="px-4 py-2.5">{formatTimingMs(result.x_runtime_ms ?? null)}</td>
                <td class="max-w-[18rem] truncate px-4 py-2.5">{parseServerTimingSummary(result.server_timing_json)}</td>
                <td class="max-w-[18rem] truncate px-4 py-2.5">{formatNullable(result.error)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} class="px-4 py-6 text-sm text-slate-400">
                直近のチェック結果はまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </DetailCard>
);

const CheckDetailShell = ({ data }: { data: CheckDetailData }) => {
  const stateBadge = describeCheckState(data.check.enabled, data.check.last_state);
  const maintenanceBadge = describeMaintenanceBadge(data.check);

  return (
    <section id="check-detail-shell" class="w-full">
      <div class="shell">
        <header class="section-head flex flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-bold uppercase tracking-[0.28em] text-sky-300">Check detail</p>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <h2 class="text-3xl font-black tracking-tight text-slate-50">{data.check.name}</h2>
              <span class={stateBadge.className}>
                <span class="dot"></span>
                {stateBadge.label}
              </span>
            </div>
            <p class="mt-3 max-w-2xl text-sm text-slate-300">{data.check.url}</p>
            <div class="mt-4 flex flex-wrap items-center gap-2">
              <span class="glass-button inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold text-slate-100">
                {data.check.enabled ? "有効" : "無効"}
              </span>
              {maintenanceBadge ? (
                <span class={maintenanceBadge.className}>
                  <span class="dot"></span>
                  {maintenanceBadge.label}
                </span>
              ) : null}
              <span class="glass-button inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold text-slate-100">
                最終更新
                <span class="ml-2 font-mono tabular-nums">
                  <LocalTime iso={data.check.updated_at} class="whitespace-nowrap" />
                </span>
              </span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <a href="/checks" class="glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100">
              一覧へ戻る
            </a>
          </div>
        </header>

        <div class="grid gap-4">
          <SettingsSection data={data} />
          <ReportSection data={data} />
          <GraphSection data={data} />
          <CertificateSection data={data} />
          <EventsSection data={data} />
          <IncidentsSection data={data} />
          <ResultsSection data={data} />
        </div>
      </div>
    </section>
  );
};

const CheckDetailDocument = ({
  data,
  accessIdentity,
}: {
  data: CheckDetailData;
  accessIdentity: CloudflareAccessIdentity | null;
}) => (
  <AppLayout
    title={`Edge Pulse / ${data.check.name}`}
    activeHref="/checks"
    footerStatus={data.check.last_state === "fail" ? "degraded" : "healthy"}
    accessIdentity={accessIdentity}
  >
    <CheckDetailShell data={data} />
  </AppLayout>
);

export const renderCheckDetailShell = (data: CheckDetailData): string => renderToString(<CheckDetailShell data={data} />);

export const renderCheckDetailPage = (data: CheckDetailData, accessIdentity: CloudflareAccessIdentity | null = null): Response =>
  new Response(renderToString(<CheckDetailDocument data={data} accessIdentity={accessIdentity} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
