import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import { summarizeDashboard, type DashboardData, type IncidentRow } from "../lib/dashboard-data";
import type { CheckRow } from "../lib/checks";

const formatNullable = (value: string | number | null | undefined, fallback = "-"): string => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const formatCertificateDays = (daysRemaining: number | null | undefined): string => {
  if (daysRemaining === null || daysRemaining === undefined) return "-";
  if (daysRemaining < 0) return `期限切れ ${Math.abs(daysRemaining)} 日前`;
  return `残り ${daysRemaining} 日`;
};

const formatDuration = (startedAt: string, resolvedAt: string | null): string => {
  const start = new Date(startedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
};

const CertificateBadge = ({ check }: { check: CheckRow }) => {
  if (check.tls_last_error) {
    return <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">証明書確認失敗</span>;
  }
  if (typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30) {
    return <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">証明書要確認</span>;
  }
  if (check.tls_valid_to) {
    return <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">証明書OK</span>;
  }
  return <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-950">証明書未取得</span>;
};

const SummaryCard = ({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string | number | null;
}) => (
  <div id={id} class="glass-surface min-h-28 rounded-2xl p-4">
    <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p class="text-3xl font-bold tracking-tight text-slate-50">{formatNullable(value)}</p>
    </div>
  </div>
);

const IncidentCard = ({ incident }: { incident: IncidentRow }) => (
  <div id={`current-incident-${incident.id}`} class="glass-surface rounded-2xl border border-rose-400/20 bg-rose-950/30 p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-semibold text-rose-100">{incident.check_name}</p>
        <p class="mt-1 text-sm text-rose-200">
          開始 {incident.started_at} / 継続 {formatDuration(incident.started_at, incident.resolved_at)}
        </p>
      </div>
      <span class="rounded-full bg-rose-200 px-3 py-1 text-xs font-semibold text-rose-950">障害中</span>
    </div>
    <p class="mt-3 text-sm text-rose-200">理由: {incident.start_reason ?? "unknown"}</p>
  </div>
);

const RecentCheckCard = ({ check }: { check: CheckRow }) => {
  const stateLabel = !check.enabled ? "停止中" : check.last_state === "ok" ? "OK" : check.last_state === "fail" ? "障害中" : "未確認";
  const badgeClass =
    !check.enabled ? "bg-slate-100 text-slate-950" : check.last_state === "ok" ? "bg-emerald-100 text-emerald-950" : check.last_state === "fail" ? "bg-rose-100 text-rose-950" : "bg-slate-100 text-slate-950";

  return (
    <article id={`recent-check-${check.id}`} class="glass-surface rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-semibold text-slate-50">{check.name}</p>
          <p class="mt-1 truncate text-sm text-slate-400">{check.url}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <span class={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>{stateLabel}</span>
          <CertificateBadge check={check} />
        </div>
      </div>
      <dl class="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <div>
          <dt class="text-slate-500">最終確認</dt>
          <dd class="mt-1">{formatNullable(check.last_checked_at)}</dd>
        </div>
        <div>
          <dt class="text-slate-500">HTTP / 遅延</dt>
          <dd class="mt-1">
            {formatNullable(check.last_status_code)} / {check.last_latency_ms === null ? "-" : `${check.last_latency_ms}ms`}
          </dd>
        </div>
        <div>
          <dt class="text-slate-500">間隔</dt>
          <dd class="mt-1">{check.interval_minutes} 分</dd>
        </div>
        <div>
          <dt class="text-slate-500">追加</dt>
          <dd class="mt-1">{check.created_at}</dd>
        </div>
        <div>
          <dt class="text-slate-500">証明書</dt>
          <dd class="mt-1">{formatCertificateDays(check.tls_days_remaining)}</dd>
        </div>
      </dl>
    </article>
  );
};

const ResultRow = ({ result }: { result: DashboardData["recentResults"][number] }) => (
  <tr id={`check-result-${result.id}`}>
    <td class="font-medium text-slate-50">{result.check_name ?? result.check_id}</td>
    <td>{result.state}</td>
    <td>{formatNullable(result.status_code)}</td>
    <td>{formatNullable(result.latency_ms)}</td>
    <td class="max-w-[16rem] truncate">{formatNullable(result.error)}</td>
    <td>{result.checked_at}</td>
  </tr>
);

const EventRow = ({ event }: { event: DashboardData["recentEvents"][number] }) => (
  <tr id={`status-event-${event.id}`}>
    <td class="font-medium text-slate-50">{event.check_name ?? event.check_id}</td>
    <td>
      {event.from_state} → {event.to_state}
    </td>
    <td>{formatNullable(event.reason)}</td>
    <td>{formatNullable(event.status_code)}</td>
    <td class="max-w-[16rem] truncate">{formatNullable(event.error)}</td>
    <td>{event.occurred_at}</td>
  </tr>
);

const IncidentHistoryRow = ({ incident }: { incident: DashboardData["recentIncidents"][number] }) => (
  <tr id={`incident-history-${incident.id}`}>
    <td class="pr-4 font-medium text-slate-50">{incident.check_name}</td>
    <td class="pr-4">{incident.started_at}</td>
    <td class="pr-4">{formatNullable(incident.resolved_at)}</td>
    <td class="pr-4">{formatDuration(incident.started_at, incident.resolved_at)}</td>
    <td class="pr-4">{formatNullable(incident.start_reason)}</td>
    <td class="pr-4">
      {incident.resolved_at ? <span class="font-semibold text-emerald-400">復旧</span> : <span class="font-semibold text-rose-400">継続中</span>}
    </td>
  </tr>
);

const DashboardShell = ({ data }: { data: DashboardData }) => {
  const summary = summarizeDashboard(data.checks, data.recentIncidents);
  const recentChecks = data.recentChecks;

  return (
    <section id="dashboard-shell" class="w-full">
      <div class="glass-surface-elevated flex flex-col gap-4 rounded-[2rem] p-6">
        <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Status control panel</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-slate-50">監視状態の概要</h2>
            <p class="mt-2 max-w-2xl text-sm text-slate-400">D1 を唯一の状態保存先として、現在状態・障害・直近の追加情報だけを表示します。</p>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <button
              id="dashboard-auto-reload-toggle"
              type="button"
              class="glass-button inline-flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-100 transition focus-visible:outline-none"
              aria-pressed="false"
              data-active="false"
            >
              <span id="dashboard-auto-reload-idle" class="text-sm font-semibold text-slate-50">
                自動更新
              </span>
              <span id="dashboard-auto-reload-active" class="hidden items-center gap-3">
                <span
                  id="dashboard-auto-reload-ring"
                  class="auto-reload-ring relative grid h-12 w-12 place-items-center rounded-full border border-slate-700 bg-slate-950/90 text-sm font-black text-slate-50"
                  aria-hidden="true"
                >
                  <span data-role="center" class="pointer-events-none select-none">
                    30s
                  </span>
                </span>
              </span>
            </button>
            <a href="/checks" class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100">
              監視一覧へ
            </a>
          </div>
        </header>

        <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard id="summary-total-checks" label="監視URL" value={summary.totalChecks} />
          <SummaryCard id="summary-ok-checks" label="稼働中" value={summary.okChecks} />
          <SummaryCard id="summary-failed-checks" label="障害中" value={summary.failedChecks} />
          <SummaryCard id="summary-cert-expiring" label="証明書30日以内" value={summary.certExpiringSoonChecks} />
          <SummaryCard id="summary-incidents-24h" label="24h障害件数" value={data.incidents24h} />
          <SummaryCard
            id="summary-average-latency"
            label="平均応答"
            value={summary.averageLatencyMs === null ? "-" : `${summary.averageLatencyMs}ms`}
          />
        </section>

        <section id="current-incidents-panel" class="glass-surface rounded-3xl border border-rose-400/20 bg-rose-950/25 p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-rose-100">現在の障害</h2>
              <p class="text-sm text-rose-200">resolved_at が null の incident を表示します。</p>
            </div>
            <span class="rounded-full border border-rose-400/20 bg-rose-950/40 px-3 py-1 text-xs font-semibold text-rose-100">
              {data.currentIncidents.length} 件
            </span>
          </div>
          <div id="current-incidents-list" class="mt-4 grid gap-3 md:grid-cols-2">
            {data.currentIncidents.length > 0 ? (
              data.currentIncidents.map((incident) => <IncidentCard incident={incident} />)
            ) : (
              <p class="glass-surface rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-200">現在障害はありません。</p>
            )}
          </div>
        </section>

        <section class="grid gap-5 xl:grid-cols-2">
          <section id="recent-results-panel" class="glass-surface rounded-3xl p-5">
            <h2 class="text-lg font-bold text-slate-50">直近チェック結果</h2>
            <div class="mt-4 overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="text-slate-400">
                  <tr>
                    <th class="pb-2 pr-4 font-semibold">対象</th>
                    <th class="pb-2 pr-4 font-semibold">状態</th>
                    <th class="pb-2 pr-4 font-semibold">HTTP</th>
                    <th class="pb-2 pr-4 font-semibold">遅延</th>
                    <th class="pb-2 pr-4 font-semibold">エラー</th>
                    <th class="pb-2 pr-4 font-semibold">時刻</th>
                  </tr>
                </thead>
                <tbody id="recent-results-list" class="align-top text-slate-300">
                  {data.recentResults.length > 0 ? (
                    data.recentResults.map((result) => <ResultRow result={result} />)
                  ) : (
                    <tr id="recent-results-empty">
                      <td colSpan={6} class="py-4 text-slate-400">
                        履歴はまだありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section id="status-events-panel" class="glass-surface rounded-3xl p-5">
            <h2 class="text-lg font-bold text-slate-50">状態遷移イベント</h2>
            <div class="mt-4 overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="text-slate-400">
                  <tr>
                    <th class="pb-2 pr-4 font-semibold">対象</th>
                    <th class="pb-2 pr-4 font-semibold">遷移</th>
                    <th class="pb-2 pr-4 font-semibold">理由</th>
                    <th class="pb-2 pr-4 font-semibold">HTTP</th>
                    <th class="pb-2 pr-4 font-semibold">エラー</th>
                    <th class="pb-2 pr-4 font-semibold">時刻</th>
                  </tr>
                </thead>
                <tbody id="status-events-list" class="align-top text-slate-300">
                  {data.recentEvents.length > 0 ? (
                    data.recentEvents.map((event) => <EventRow event={event} />)
                  ) : (
                    <tr id="status-events-empty">
                      <td colSpan={6} class="py-4 text-slate-400">
                        イベントはまだありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section id="recent-checks-panel" class="glass-surface rounded-3xl p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-slate-50">最近の追加</h2>
              <p class="text-sm text-slate-400">最新の監視対象を表示します。</p>
            </div>
            <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              {recentChecks.length} 件
            </span>
          </div>
          <div id="recent-checks-list" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentChecks.length > 0 ? (
              recentChecks.map((check) => <RecentCheckCard check={check} />)
            ) : (
              <p class="glass-surface rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-200">最近の監視対象はありません。</p>
            )}
          </div>
        </section>

        <section id="incident-history-panel" class="glass-surface rounded-3xl p-5">
          <h2 class="text-lg font-bold text-slate-50">最近の incident</h2>
          <div class="mt-4 overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="text-slate-400">
                <tr>
                  <th class="pb-2 pr-4 font-semibold">対象</th>
                  <th class="pb-2 pr-4 font-semibold">開始</th>
                  <th class="pb-2 pr-4 font-semibold">復旧</th>
                  <th class="pb-2 pr-4 font-semibold">継続</th>
                  <th class="pb-2 pr-4 font-semibold">理由</th>
                  <th class="pb-2 pr-4 font-semibold">状態</th>
                </tr>
              </thead>
              <tbody id="incident-history-list" class="align-top text-slate-300">
                {data.recentIncidents.length > 0 ? (
                  data.recentIncidents.map((incident) => <IncidentHistoryRow incident={incident} />)
                ) : (
                  <tr id="incident-history-empty">
                      <td colSpan={6} class="py-4 text-slate-400">
                      incident はまだありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p class="text-sm text-slate-400">Checked from Cloudflare edge. Check location is not fixed.</p>
      </div>
    </section>
  );
};

const DashboardDocument = ({ data }: { data: DashboardData }) => (
  <AppLayout title="Edge Pulse" activeHref="/">
    <DashboardShell data={data} />
  </AppLayout>
);

export const renderDashboardShell = (data: DashboardData): string => renderToString(<DashboardShell data={data} />);

export const renderDashboardPage = (data: DashboardData): Response =>
  new Response(renderToString(<DashboardDocument data={data} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export type { DashboardData };
