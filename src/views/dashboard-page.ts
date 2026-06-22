import { html, raw } from "hono/html";
import type { DashboardData, IncidentRow } from "../lib/dashboard-data";
import { summarizeDashboard } from "../lib/dashboard-data";
import type { CheckRow } from "../lib/checks";

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatNullable = (value: string | number | null | undefined, fallback = "-"): string => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
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

const renderSummaryCard = (id: string, label: string, value: string | number | null) => `
  <div id="${id}" class="min-h-28 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm shadow-black/20">
    <div class="flex h-full flex-col items-center justify-center text-center gap-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${escapeHtml(label)}</p>
      <p class="text-3xl font-bold tracking-tight text-slate-50">${escapeHtml(formatNullable(value))}</p>
    </div>
  </div>
`;

const renderIncidentCard = (incident: IncidentRow) => `
  <div id="current-incident-${incident.id}" class="rounded-2xl border border-rose-900/60 bg-rose-950/40 p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-semibold text-rose-100">${escapeHtml(incident.check_name)}</p>
        <p class="mt-1 text-sm text-rose-200">開始 ${escapeHtml(incident.started_at)} / 継続 ${escapeHtml(formatDuration(incident.started_at, incident.resolved_at))}</p>
      </div>
      <span class="rounded-full bg-rose-900/70 px-3 py-1 text-xs font-semibold text-rose-100">障害中</span>
    </div>
    <p class="mt-3 text-sm text-rose-200">理由: ${escapeHtml(incident.start_reason ?? "unknown")}</p>
  </div>
`;

const renderRecentCheckCard = (check: CheckRow) => {
  const stateLabel = !check.enabled ? "停止中" : check.last_state === "ok" ? "OK" : check.last_state === "fail" ? "障害中" : "未確認";
  const badgeClass =
    !check.enabled ? "bg-slate-200 text-slate-700" : check.last_state === "ok" ? "bg-emerald-100 text-emerald-800" : check.last_state === "fail" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700";

  return `
    <div id="recent-check-${check.id}" class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-semibold text-slate-50">${escapeHtml(check.name)}</p>
          <p class="mt-1 truncate text-sm text-slate-400">${escapeHtml(check.url)}</p>
        </div>
        <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}">${escapeHtml(stateLabel)}</span>
      </div>
      <dl class="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <div>
          <dt class="text-slate-500">最終確認</dt>
          <dd class="mt-1">${escapeHtml(formatNullable(check.last_checked_at))}</dd>
        </div>
        <div>
          <dt class="text-slate-500">HTTP / 遅延</dt>
          <dd class="mt-1">${escapeHtml(formatNullable(check.last_status_code))} / ${escapeHtml(check.last_latency_ms === null ? "-" : `${check.last_latency_ms}ms`)}</dd>
        </div>
        <div>
          <dt class="text-slate-500">間隔</dt>
          <dd class="mt-1">${check.interval_minutes} 分</dd>
        </div>
        <div>
          <dt class="text-slate-500">追加</dt>
          <dd class="mt-1">${escapeHtml(check.created_at)}</dd>
        </div>
      </dl>
    </div>
  `;
};

const renderResultRow = (result: DashboardData["recentResults"][number]) => `
  <tr id="check-result-${result.id}">
    <td class="font-medium text-slate-50">${escapeHtml(result.check_name ?? result.check_id)}</td>
    <td>${escapeHtml(result.state)}</td>
    <td>${escapeHtml(formatNullable(result.status_code))}</td>
    <td>${escapeHtml(formatNullable(result.latency_ms))}</td>
    <td class="max-w-[16rem] truncate">${escapeHtml(formatNullable(result.error))}</td>
    <td>${escapeHtml(result.checked_at)}</td>
  </tr>
`;

const renderEventRow = (event: DashboardData["recentEvents"][number]) => `
  <tr id="status-event-${event.id}">
    <td class="font-medium text-slate-50">${escapeHtml(event.check_name ?? event.check_id)}</td>
    <td>${escapeHtml(event.from_state)} → ${escapeHtml(event.to_state)}</td>
    <td>${escapeHtml(formatNullable(event.reason))}</td>
    <td>${escapeHtml(formatNullable(event.status_code))}</td>
    <td class="max-w-[16rem] truncate">${escapeHtml(formatNullable(event.error))}</td>
    <td>${escapeHtml(event.occurred_at)}</td>
  </tr>
`;

const renderIncidentHistoryRow = (incident: DashboardData["recentIncidents"][number]) => `
  <tr id="incident-history-${incident.id}">
    <td class="pr-4 font-medium text-slate-50">${escapeHtml(incident.check_name)}</td>
    <td class="pr-4">${escapeHtml(incident.started_at)}</td>
    <td class="pr-4">${escapeHtml(formatNullable(incident.resolved_at))}</td>
    <td class="pr-4">${escapeHtml(formatDuration(incident.started_at, incident.resolved_at))}</td>
    <td class="pr-4">${escapeHtml(formatNullable(incident.start_reason))}</td>
    <td class="pr-4">${incident.resolved_at ? '<span class="font-semibold text-emerald-400">復旧</span>' : '<span class="font-semibold text-rose-400">継続中</span>'}</td>
  </tr>
`;

const renderDashboardMain = (data: DashboardData): string => {
  const summary = summarizeDashboard(data.checks, data.recentIncidents);
  const recentChecks = data.recentChecks;

  return `
    <section id="dashboard-shell" class="w-full">
      <div class="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-950/60 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Status control panel</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-slate-50">監視状態の概要</h2>
            <p class="mt-2 max-w-2xl text-sm text-slate-400">D1 を唯一の状態保存先として、現在状態・障害・直近の追加情報だけを表示します。</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <a href="/checks" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100">監視一覧へ</a>
          </div>
        </header>

        <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          ${renderSummaryCard("summary-total-checks", "監視URL", summary.totalChecks)}
          ${renderSummaryCard("summary-ok-checks", "稼働中", summary.okChecks)}
          ${renderSummaryCard("summary-failed-checks", "障害中", summary.failedChecks)}
          ${renderSummaryCard("summary-incidents-24h", "24h障害件数", data.incidents24h)}
          ${renderSummaryCard("summary-average-latency", "平均応答", summary.averageLatencyMs === null ? "-" : `${summary.averageLatencyMs}ms`)}
        </section>

        <section id="current-incidents-panel" class="rounded-3xl border border-rose-900/60 bg-rose-950/30 p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-rose-100">現在の障害</h2>
              <p class="text-sm text-rose-200">resolved_at が null の incident を表示します。</p>
            </div>
            <span class="rounded-full bg-rose-900/80 px-3 py-1 text-xs font-semibold text-rose-100">${data.currentIncidents.length} 件</span>
          </div>
          <div id="current-incidents-list" class="mt-4 grid gap-3 md:grid-cols-2">
            ${data.currentIncidents.length > 0 ? data.currentIncidents.map(renderIncidentCard).join("") : '<p class="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">現在障害はありません。</p>'}
          </div>
        </section>

        <section id="recent-checks-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-slate-50">最近の追加</h2>
              <p class="text-sm text-slate-400">新しく追加された監視対象の概要だけを表示します。</p>
            </div>
          </div>
          <div id="recent-checks-list" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            ${recentChecks.length > 0 ? recentChecks.map(renderRecentCheckCard).join("") : '<p id="recent-checks-empty" class="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">まだ監視対象がありません。</p>'}
          </div>
        </section>

        <section class="grid gap-5 xl:grid-cols-2">
          <section id="recent-results-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
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
                  ${data.recentResults.length > 0 ? data.recentResults.map(renderResultRow).join("") : '<tr id="recent-results-empty"><td colspan="6" class="py-4 text-slate-400">履歴はまだありません。</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>

          <section id="status-events-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
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
                  ${data.recentEvents.length > 0 ? data.recentEvents.map(renderEventRow).join("") : '<tr id="status-events-empty"><td colspan="6" class="py-4 text-slate-400">イベントはまだありません。</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section id="incident-history-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
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
                ${data.recentIncidents.length > 0 ? data.recentIncidents.map(renderIncidentHistoryRow).join("") : '<tr id="incident-history-empty"><td colspan="6" class="py-4 text-slate-400">incident はまだありません。</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <p class="text-sm text-slate-400">Checked from Cloudflare edge. Check location is not fixed.</p>
      </div>
    </section>
  `;
};

const renderDocument = (body: string): string => `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Edge Pulse</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <style>
      :root { color-scheme: dark; }
      body {
        background:
          radial-gradient(circle at top, rgba(56, 189, 248, 0.16), transparent 32%),
          linear-gradient(180deg, #020617 0%, #0f172a 100%);
      }
    </style>
  </head>
  <body class="min-h-screen text-slate-100">
    <header class="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Cloudflare Workers uptime monitor</p>
          <h1 class="mt-1 text-2xl font-black tracking-tight text-slate-50">Edge Pulse</h1>
        </div>
        <div class="flex items-center gap-2">
          <a href="/" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100">概要</a>
          <a href="/checks" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100">監視一覧</a>
        </div>
      </div>
    </header>
    ${body}
    <footer class="mt-6 w-full border-t border-slate-800 bg-slate-950/85">
      <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-400 sm:px-6 lg:px-8">
        Edge Pulse
      </div>
    </footer>
  </body>
</html>`;

export const renderDashboardHtml = (data: DashboardData): string => renderDocument(renderDashboardMain(data));

export const renderDashboardShell = (data: DashboardData): string => renderDashboardMain(data);

export const renderDashboardPage = async (data: DashboardData): Promise<Response> =>
  new Response(await html`${raw(renderDashboardHtml(data))}`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export type { DashboardData };
