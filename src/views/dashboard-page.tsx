import type { Child } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import { summarizeDashboard, type DashboardData as DashboardDataType, type IncidentRow } from "../store/dashboard";
import type { CheckRow } from "../lib/checks";
import { calculateCertificateDaysRemaining } from "../lib/checks";
import { calculateNextCertificateProbeAt } from "../lib/cert-probe";
import { buildChecksUrl } from "../lib/checks-search";
import { LocalTime } from "./time.tsx";
import { formatNullable } from "../presenters/common";
import { formatCertificateDays, formatDuration } from "../presenters/dashboard";
import { describeCheckState, describeMaintenanceBadge } from "../presenters/checks";
import type { CloudflareAccessIdentity } from "../http/shared";

export type DashboardData = DashboardDataType;

const StatusBadge = ({ enabled, state }: { enabled: number; state: CheckRow["last_state"] }) => {
  const badge = describeCheckState(enabled, state);

  return (
    <span class={badge.className}>
      <span class="dot"></span>
      {badge.label}
    </span>
  );
};

const CertificateBadge = ({ check }: { check: CheckRow }) => {
  if (check.tls_last_error) {
    return <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">証明書確認失敗</span>;
  }
  const daysRemaining = calculateCertificateDaysRemaining(check.tls_valid_to);
  if (daysRemaining === null) {
    return <span class="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold text-slate-100">証明書未取得</span>;
  }
  if (daysRemaining !== null && daysRemaining <= 30) {
    return <span class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">証明書要確認</span>;
  }
  return <span class="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">証明書OK</span>;
};

const SummaryCard = ({
  id,
  label,
  value,
  tone = "default",
  icon,
  href,
}: {
  id: string;
  label: string;
  value: string | number | null;
  tone?: "default" | "danger";
  icon: Child;
  href?: string;
}) => (href ? (
  <a id={id} href={href} class={`metric-card block ${tone === "danger" ? "danger" : ""} p-5`}>
      <div class="flex h-full flex-col justify-between gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-bold tracking-wide text-slate-200">{label}</p>
            <p class="mt-2 text-right text-4xl font-black tracking-tight text-slate-50">{formatNullable(value)}</p>
          </div>
          <span class="metric-icon grid h-12 w-12 place-items-center rounded-md border border-white/10 bg-white/5 text-sky-200">{icon}</span>
        </div>
      {tone === "danger" ? <div class="flatline" aria-hidden="true" /> : <div class="sparkline" aria-hidden="true" />}
    </div>
  </a>
) : (
  <div id={id} class={`metric-card ${tone === "danger" ? "danger" : ""} p-5`}>
      <div class="flex h-full flex-col justify-between gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-bold tracking-wide text-slate-200">{label}</p>
            <p class="mt-2 text-right text-4xl font-black tracking-tight text-slate-50">{formatNullable(value)}</p>
          </div>
          <span class="metric-icon grid h-12 w-12 place-items-center rounded-md border border-white/10 bg-white/5 text-sky-200">{icon}</span>
        </div>
      {tone === "danger" ? <div class="flatline" aria-hidden="true" /> : <div class="sparkline" aria-hidden="true" />}
    </div>
  </div>
));

const IncidentCard = ({ incident }: { incident: IncidentRow }) => (
  <div id={`current-incident-${incident.id}`} class="border border-rose-400/20 bg-rose-950/25 p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-semibold text-rose-100">
          <a href={`/checks/${incident.check_id}`} class="hover:underline">
            {incident.check_name}
          </a>
        </p>
        <p class="mt-1 text-sm text-rose-200">
          開始 <LocalTime iso={incident.started_at} class="whitespace-nowrap" /> / 継続 {formatDuration(incident.started_at, incident.resolved_at)}
        </p>
      </div>
      <StatusBadge enabled={1} state="fail" />
    </div>
    <p class="mt-3 text-sm text-rose-200">理由: {incident.start_reason ?? "unknown"}</p>
  </div>
);

const RecentCheckCard = ({ check, generatedAt }: { check: DashboardData["checks"][number]; generatedAt: string }) => {
  const maintenanceBadge = describeMaintenanceBadge(check);
  const daysRemaining = calculateCertificateDaysRemaining(check.tls_valid_to);
  const shouldShowCertificateRecheck = Boolean(check.tls_last_error) || (daysRemaining !== null && daysRemaining <= 30);
  const nextCertificateProbeAt = calculateNextCertificateProbeAt(check);
  const uptimeStartedAt = check.last_state === "ok" ? check.uptime_started_at ?? null : null;
  return (
    <article id={`recent-check-${check.id}`} class="recent-check-card relative overflow-hidden p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-semibold text-slate-50">
            <a href={`/checks/${check.id}`} class="hover:underline">
              {check.name}
            </a>
          </p>
          <p class="mt-1 truncate text-sm text-slate-300">{check.url}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge enabled={check.enabled} state={check.last_state} />
          {maintenanceBadge ? (
            <span class={maintenanceBadge.className}>
              <span class="dot"></span>
              {maintenanceBadge.label}
            </span>
          ) : null}
          <CertificateBadge check={check} />
        </div>
      </div>
      {shouldShowCertificateRecheck ? (
        <>
          <div class="flatline my-4" aria-hidden="true" />
          <dl class="cert-recheck-grid grid gap-y-5 text-sm text-slate-300 sm:grid-cols-2 sm:gap-x-8">
            <div class="cert-recheck-divider" aria-hidden="true"></div>
            <div class="cert-recheck-item">
              <dt class="font-bold text-slate-200">証明書の最終確認</dt>
              <dd class="mt-2"><LocalTime iso={check.tls_last_checked_at} class="whitespace-nowrap" /></dd>
            </div>
            <div class="cert-recheck-item">
              <dt class="font-bold text-slate-200">証明書残日数</dt>
              <dd class="mt-2">{formatCertificateDays(check.tls_valid_to)}</dd>
            </div>
            <div class="cert-recheck-item">
              <dt class="font-bold text-slate-200">次回証明書確認</dt>
              <dd class="mt-2">{nextCertificateProbeAt ? <LocalTime iso={nextCertificateProbeAt} class="whitespace-nowrap" /> : "-"}</dd>
            </div>
            <div class="cert-recheck-item">
              <dt class="font-bold text-slate-200">エラー</dt>
              <dd class="mt-2 break-words text-rose-200">{check.tls_last_error ?? "-"}</dd>
            </div>
            {uptimeStartedAt ? (
              <div class="cert-recheck-item">
                <dt class="font-bold text-slate-200">稼働開始日時</dt>
                <dd class="mt-2"><LocalTime iso={uptimeStartedAt} class="whitespace-nowrap" seconds={false} /></dd>
              </div>
            ) : null}
            {uptimeStartedAt ? (
              <div class="cert-recheck-item">
                <dt class="font-bold text-slate-200">連続稼働時間</dt>
                <dd class="mt-2 text-right tabular-nums">{formatDuration(uptimeStartedAt, generatedAt)}</dd>
              </div>
            ) : null}
          </dl>
          <div class="mt-4 flex justify-end">
            <form
              method="post"
              action={`/checks/${check.id}/certificate/recheck`}
              hx-post={`/checks/${check.id}/certificate/recheck`}
              hx-target={`#recent-check-${check.id}`}
              hx-swap="outerHTML show:none"
              hx-indicator={`#cert-recheck-indicator-${check.id}`}
            >
              <button class="glass-button inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-slate-100">
                再確認
              </button>
            </form>
          </div>
          <div
            id={`cert-recheck-indicator-${check.id}`}
            class="htmx-indicator absolute inset-0 z-20 flex items-center justify-center bg-slate-950/78 text-slate-100 backdrop-blur-sm"
            aria-live="polite"
            aria-label="証明書を再確認中"
          >
            <div class="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-slate-950/80 px-5 py-4 shadow-xl">
              <span class="text-3xl leading-none">⏳</span>
              <span class="text-sm font-semibold tracking-wide">証明書を再確認中</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div class="flatline my-4" aria-hidden="true" />
          <dl class="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt class="text-slate-500">監視最終確認</dt>
              <dd class="mt-1"><LocalTime iso={check.last_checked_at} class="whitespace-nowrap" /></dd>
            </div>
            <div>
              <dt class="text-slate-500">HTTP / 応答時間</dt>
              <dd class="mt-1">
                {formatNullable(check.last_status_code)} / {check.last_latency_ms === null ? "-" : `${check.last_latency_ms}ms`}
              </dd>
            </div>
            <div>
              <dt class="text-slate-500">追加</dt>
              <dd class="mt-1"><LocalTime iso={check.created_at} class="whitespace-nowrap" /></dd>
            </div>
            {uptimeStartedAt ? (
              <div>
                <dt class="text-slate-500">稼働開始日時</dt>
                <dd class="mt-1"><LocalTime iso={uptimeStartedAt} class="whitespace-nowrap" seconds={false} /></dd>
              </div>
            ) : null}
            {uptimeStartedAt ? (
              <div>
                <dt class="text-slate-500">連続稼働時間</dt>
                <dd class="mt-1 text-right tabular-nums">{formatDuration(uptimeStartedAt, generatedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
    </article>
  );
};

export const renderRecentCheckCard = (check: DashboardData["checks"][number]): string => renderToString(<RecentCheckCard check={check} generatedAt={new Date().toISOString()} />);

const ResultRow = ({ result }: { result: DashboardData["recentResults"][number] }) => (
  <tr id={`check-result-${result.id}`}>
    <td class="px-4 py-2.5 font-semibold text-slate-50">
      <a href={`/checks/${result.check_id}`} class="hover:underline">
        {result.check_name ?? result.check_id}
      </a>
    </td>
    <td class="px-4 py-2.5">
      <span
        class={
          result.state === "ok"
            ? "inline-flex items-center gap-2 text-emerald-300"
            : result.state === "fail"
              ? "inline-flex items-center gap-2 text-rose-300"
            : "inline-flex items-center gap-2 text-slate-300"
        }
      >
        <span class={`result-mark ${result.state === "fail" ? "fail" : ""}`}>{result.state === "fail" ? "×" : "✓"}</span>
        {result.state}
      </span>
    </td>
    <td class="px-4 py-2.5 text-right tabular-nums">{formatNullable(result.status_code)}</td>
    <td class="px-4 py-2.5 text-right tabular-nums">{formatNullable(result.latency_ms)}</td>
    <td class="max-w-[16rem] truncate px-4 py-2.5">{formatNullable(result.error)}</td>
    <td class="px-4 py-2.5 text-slate-300"><LocalTime iso={result.checked_at} class="whitespace-nowrap" /></td>
  </tr>
);

const EventRow = ({ event }: { event: DashboardData["recentEvents"][number] }) => (
  <tr id={`status-event-${event.id}`} class="transition hover:bg-white/5">
    <td class="font-medium text-slate-50">
      <a href={`/checks/${event.check_id}`} class="hover:underline">
        {event.check_name ?? event.check_id}
      </a>
    </td>
    <td>
      <span class="inline-flex items-center gap-2">
        <span class={`state-mark ${event.from_state === "fail" ? "fail" : ""}`}>{event.from_state === "fail" ? "×" : "✓"}</span>
        →
        <span class={`state-mark ${event.to_state === "fail" ? "fail" : ""}`}>{event.to_state === "fail" ? "×" : "✓"}</span>
      </span>
    </td>
    <td>{formatNullable(event.reason)}</td>
    <td class="text-right">{formatNullable(event.status_code)}</td>
    <td class="max-w-[16rem] truncate">{formatNullable(event.error)}</td>
    <td><LocalTime iso={event.occurred_at} class="whitespace-nowrap" /></td>
  </tr>
);

const IncidentHistoryRow = ({ incident }: { incident: DashboardData["recentIncidents"][number] }) => (
  <tr id={`incident-history-${incident.id}`} class="transition hover:bg-white/5">
    <td class="pr-4 font-medium text-slate-50">
      <a href={`/checks/${incident.check_id}`} class="hover:underline">
        {incident.check_name}
      </a>
    </td>
    <td class="pr-4"><LocalTime iso={incident.started_at} class="whitespace-nowrap" /></td>
    <td class="pr-4"><LocalTime iso={incident.resolved_at} class="whitespace-nowrap" /></td>
    <td class="pr-4 text-right tabular-nums">{formatDuration(incident.started_at, incident.resolved_at)}</td>
    <td class="pr-4">{formatNullable(incident.start_reason)}</td>
    <td class="pr-4">
      {incident.resolved_at ? <span class="font-semibold text-emerald-400">復旧</span> : <span class="font-semibold text-rose-400">継続中</span>}
    </td>
  </tr>
);

const SectionDivider = () => (
  <div class="dashboard-divider" aria-hidden="true">
    <span></span>
  </div>
);

const DashboardShell = ({ data }: { data: DashboardData }) => {
  const summary = summarizeDashboard(data.checks, data.recentIncidents);
  const recentChecks = data.recentChecks;
  const hasCurrentIncidents = data.currentIncidents.length > 0;
  const currentIncidentTone = hasCurrentIncidents
    ? "border-rose-400/40 text-rose-300"
    : "border-emerald-400/40 text-emerald-300";
  const currentIncidentIcon = hasCurrentIncidents ? (
    <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.5h3.4L21 18H3z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );

  return (
    <section id="dashboard-shell" class="w-full">
      <div class="dashboard-frame overflow-hidden rounded-xl">
        <header class="section-head flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-bold uppercase tracking-[0.28em] text-sky-300">Status control panel</p>
            <h2 class="mt-3 text-3xl font-black tracking-tight text-slate-50">監視状態の概要</h2>
            <p class="mt-3 max-w-2xl text-sm text-slate-300">D1 を唯一の状態保存先として、現在状態・障害・直近の追加情報だけを表示します。</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button
              id="dashboard-auto-reload-toggle"
              type="button"
              class="glass-button inline-flex items-center gap-3 rounded-md px-4 py-3 text-left text-slate-100 transition focus-visible:outline-none"
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
            <a id="dashboard-checks-link" href="/checks" class="glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100">
              監視一覧へ
            </a>
          </div>
        </header>

        <SectionDivider />

        <section class="grid gap-px border-b border-slate-700/30 bg-slate-700/20 p-px sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            id="summary-total-checks"
            label="監視URL"
            value={summary.totalChecks}
            href={buildChecksUrl({})}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>}
          />
          <SummaryCard
            id="summary-ok-checks"
            label="稼働中"
            value={summary.okChecks}
            href={buildChecksUrl({ filter: "(&(enabled=1)(last_state=ok))" })}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="m20 6-11 11-5-5"/></svg>}
          />
          <SummaryCard
            id="summary-failed-checks"
            label="障害中"
            value={summary.failedChecks}
            tone="danger"
            href={buildChecksUrl({ filter: "(&(enabled=1)(last_state=fail))" })}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>}
          />
          <SummaryCard
            id="summary-cert-expiring"
            label="証明書30日以内"
            value={summary.certExpiringSoonChecks}
            href={buildChecksUrl({ filter: "(&(enabled=1)(cert_expiring_soon=1))" })}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M5 8h14"/><path d="M7 16h10"/></svg>}
          />
          <SummaryCard
            id="summary-incidents-24h"
            label="24h障害件数"
            value={data.incidents24h}
            tone="danger"
            href={buildChecksUrl({ filter: "(recent_incident_24h=1)" })}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4"/><path d="M12 16h.01"/><path d="m10.29 3.86-8.1 14.06A2 2 0 0 0 4.03 21h15.94a2 2 0 0 0 1.84-3.08l-8.1-14.06a2 2 0 0 0-3.42 0Z"/></svg>}
          />
          <SummaryCard
            id="summary-average-latency"
            label="平均応答時間"
            value={summary.averageLatencyMs === null ? "-" : `${summary.averageLatencyMs}ms`}
            icon={<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h3l2-5 4 10 2-5h5"/></svg>}
          />
        </section>

        <SectionDivider />

        <section id="current-incidents-panel" class="status-strip px-6 py-5">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <span class={`grid h-10 w-10 place-items-center rounded-full ${currentIncidentTone}`}>
                {currentIncidentIcon}
              </span>
              <div>
                <h2 class="text-lg font-black tracking-tight text-slate-50">現在の障害</h2>
                <p class="text-sm text-slate-300">
                  {hasCurrentIncidents
                    ? `現在アクティブな incident が ${data.currentIncidents.length} 件あります。`
                    : "現在アクティブな incident はありません。"}
                </p>
              </div>
            </div>
            <span class="rounded-md border border-white/15 bg-white/8 px-5 py-2 text-sm font-black text-slate-100">{data.currentIncidents.length} 件</span>
          </div>
          <div id="current-incidents-list" class="mt-4 grid gap-3 md:grid-cols-2">
            {data.currentIncidents.length > 0 ? (
              data.currentIncidents.map((incident) => <IncidentCard incident={incident} />)
            ) : (
              <p class="sr-only">現在障害はありません。</p>
            )}
          </div>
        </section>

        <SectionDivider />

        {recentChecks.length > 0 ? (
          <section id="recent-checks-panel" class="subpanel px-6 py-5">
            <h2 class="panel-title flex items-center gap-2 pl-3 text-lg font-black">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 7h16" />
                <path d="M4 12h10" />
                <path d="M4 17h16" />
              </svg>
              最近の監視対象
            </h2>
            <div id="recent-checks-list" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentChecks.map((check) => <RecentCheckCard check={check} generatedAt={data.generatedAt} />)}
            </div>
          </section>
        ) : null}

        {recentChecks.length > 0 ? <SectionDivider /> : null}

        <section class="grid gap-2 bg-slate-950/20 p-2 xl:grid-cols-2">
          <section id="recent-results-panel" class="subpanel p-4 sm:p-5">
            <h2 class="panel-title flex items-center gap-2 pl-3 text-lg font-black">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
              直近チェック結果
            </h2>
            <div class="table-wrap mt-4 overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th class="px-4 py-3 font-bold">対象</th>
                    <th class="px-4 py-3 font-bold">状態</th>
                    <th class="px-4 py-3 font-bold text-right">HTTP</th>
                    <th class="px-4 py-3 font-bold">応答時間</th>
                    <th class="px-4 py-3 font-bold">エラー</th>
                    <th class="px-4 py-3 font-bold">時刻</th>
                  </tr>
                </thead>
                <tbody id="recent-results-list" class="align-top text-slate-300">
                  {data.recentResults.length > 0 ? (
                    data.recentResults.map((result) => <ResultRow result={result} />)
                  ) : (
                    <tr id="recent-results-empty">
                      <td colSpan={6} class="p-0">
                        <div class="empty-state">
                          <div>
                            <span class="empty-icon">
                              <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
                            </span>
                            <p class="mt-4 font-bold text-slate-100">履歴はまだありません。</p>
                            <p class="mt-1 text-sm text-slate-400">チェックが実行されると、ここに最新結果が並びます。</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section id="status-events-panel" class="subpanel p-4 sm:p-5">
            <h2 class="panel-title flex items-center gap-2 pl-3 text-lg font-black">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 6.5h7M8.5 7.5l7 9"/></svg>
              状態遷移イベント
            </h2>
            <div class="table-wrap mt-4 overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    <th class="px-4 py-3 font-bold">対象</th>
                    <th class="px-4 py-3 font-bold">遷移</th>
                    <th class="px-4 py-3 font-bold">理由</th>
                    <th class="px-4 py-3 font-bold">HTTP</th>
                    <th class="px-4 py-3 font-bold">エラー</th>
                    <th class="px-4 py-3 font-bold">時刻</th>
                  </tr>
                </thead>
                <tbody id="status-events-list" class="align-top text-slate-300">
                  {data.recentEvents.length > 0 ? (
                    data.recentEvents.map((event) => <EventRow event={event} />)
                  ) : (
                    <tr id="status-events-empty">
                      <td colSpan={6} class="p-0">
                        <div class="empty-state">
                          <div>
                            <span class="empty-icon">
                              <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                            </span>
                            <p class="mt-4 font-bold text-slate-100">イベントはまだありません。</p>
                            <p class="mt-1 text-sm text-slate-400">状態の変化が発生すると、ここに表示されます。</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <SectionDivider />

        <section id="incident-history-panel" class="incident-history px-6 py-5">
          <h2 class="panel-title flex items-center gap-2 pl-3 text-lg font-black">
            <svg viewBox="0 0 24 24" class="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>
            最近の incident
          </h2>
          <div class="table-wrap mt-4 overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead>
                <tr>
                  <th class="px-4 py-3 font-bold">対象</th>
                  <th class="px-4 py-3 font-bold">開始</th>
                  <th class="px-4 py-3 font-bold">復旧</th>
                  <th class="px-4 py-3 font-bold text-right">継続</th>
                  <th class="px-4 py-3 font-bold">理由</th>
                  <th class="px-4 py-3 font-bold">状態</th>
                </tr>
              </thead>
              <tbody id="incident-history-list" class="align-top text-slate-300">
                {data.recentIncidents.length > 0 ? (
                  data.recentIncidents.map((incident) => <IncidentHistoryRow incident={incident} />)
                ) : (
                  <tr id="incident-history-empty">
                    <td colSpan={6} class="p-0">
                      <div class="empty-state">
                        <div>
                          <span class="empty-icon text-emerald-200">
                            <svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="2"><path d="m20 6-11 11-5-5"/></svg>
                          </span>
                          <p class="mt-4 font-bold text-slate-100">incident はまだありません。</p>
                          <p class="mt-1 text-sm text-slate-400">障害が発生すると、ここに表示されます。</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
};

const DashboardDocument = ({ data, accessIdentity }: { data: DashboardData; accessIdentity: CloudflareAccessIdentity | null }) => (
  <AppLayout
    title="Edge Pulse"
    activeHref="/"
    footerStatus={data.currentIncidents.length > 0 || data.checks.some((check) => check.enabled === 1 && check.last_state === "fail") ? "degraded" : "healthy"}
    accessIdentity={accessIdentity}
    resetScrollOnLoad={true}
  >
    <DashboardShell data={data} />
  </AppLayout>
);

export const renderDashboardShell = (data: DashboardData): string => renderToString(<DashboardShell data={data} />);

export const renderDashboardPage = (data: DashboardData, accessIdentity: CloudflareAccessIdentity | null = null): Response =>
  new Response(renderToString(<DashboardDocument data={data} accessIdentity={accessIdentity} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
