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

const stateBadgeClass = (state: CheckRow["last_state"], enabled: number): string => {
  if (!enabled) return "bg-slate-200 text-slate-700";
  if (state === "ok") return "bg-emerald-100 text-emerald-800";
  if (state === "fail") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
};

const statusLabel = (check: CheckRow): string => {
  if (!check.enabled) return "停止中";
  if (check.last_state === "ok") return "OK";
  if (check.last_state === "fail") return "障害中";
  return "未確認";
};

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
  <div id="${id}" class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm shadow-black/20">
    <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">${escapeHtml(label)}</p>
    <p class="mt-2 text-3xl font-bold tracking-tight text-slate-50">${escapeHtml(formatNullable(value))}</p>
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

const renderCheckRow = (check: CheckRow) => `
  <form id="check-row-${check.id}" class="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm shadow-black/20 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,0.8fr))_minmax(0,0.8fr)]" hx-post="/checks/${check.id}" hx-target="#dashboard-shell" hx-swap="outerHTML">
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">名称</span>
      <input name="name" value="${escapeHtml(check.name)}" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
    </label>
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">URL</span>
      <input name="url" value="${escapeHtml(check.url)}" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
    </label>
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">間隔</span>
      <input name="interval_minutes" type="number" min="1" max="1440" value="${check.interval_minutes}" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
    </label>
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">失敗</span>
      <input name="fail_threshold" type="number" min="1" value="${check.fail_threshold}" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
    </label>
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">復旧</span>
      <input name="recovery_threshold" type="number" min="1" value="${check.recovery_threshold}" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
    </label>
    <label class="grid min-w-0 gap-1 text-sm">
      <span class="font-semibold text-slate-300">状態</span>
      <select name="enabled" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100">
        <option value="1" ${check.enabled ? "selected" : ""}>有効</option>
        <option value="0" ${!check.enabled ? "selected" : ""}>無効</option>
      </select>
    </label>
    <button id="check-row-${check.id}-save" class="inline-flex h-10 w-full min-w-0 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 xl:self-end">保存</button>
  </form>
`;

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

export const renderDashboardHtml = (data: DashboardData): string => {
  const summary = summarizeDashboard(data.checks, data.recentIncidents);

  return `<!doctype html>
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
          <a href="/" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100">更新</a>
        </div>
      </div>
    </header>
    <main id="dashboard-shell" class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-950/60 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Status control panel</p>
            <h2 class="mt-2 text-3xl font-black tracking-tight text-slate-50">監視対象の状態を D1 から表示</h2>
            <p class="mt-2 max-w-2xl text-sm text-slate-400">Cloudflare edge から見える到達性を、D1 を唯一の状態保存先として管理します。dev では認証なしで表示します。</p>
          </div>
          <div class="flex flex-wrap gap-2">
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

        <section id="new-check-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-slate-50">新規監視</h2>
              <p class="text-sm text-slate-400">URL 登録は HTMX で送信します。</p>
            </div>
          </div>
          <form id="checks-create-form" class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,0.8fr))_minmax(0,0.8fr)]" hx-post="/checks" hx-target="#dashboard-shell" hx-swap="outerHTML">
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">名称</span>
              <input name="name" required placeholder="payments.example.com" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
            </label>
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">URL</span>
              <input name="url" required placeholder="https://payments.example.com" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
            </label>
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">間隔</span>
              <input name="interval_minutes" type="number" min="1" max="1440" value="5" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
            </label>
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">失敗</span>
              <input name="fail_threshold" type="number" min="1" value="2" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
            </label>
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">復旧</span>
              <input name="recovery_threshold" type="number" min="1" value="1" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
            </label>
            <label class="grid min-w-0 gap-1 text-sm">
              <span class="font-semibold text-slate-300">状態</span>
              <select name="enabled" class="w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100">
                <option value="1">有効</option>
                <option value="0">無効</option>
              </select>
            </label>
            <button id="checks-create-submit" class="inline-flex h-10 w-full min-w-0 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 xl:self-end">追加</button>
          </form>
        </section>

        <section class="grid gap-5 xl:grid-cols-2">
          <div id="checks-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-bold text-slate-50">監視対象</h2>
              <span class="text-sm text-slate-400">${data.checks.length} 件</span>
            </div>
            <div id="checks-list" class="mt-4 grid gap-3">
              ${data.checks.length > 0 ? data.checks.map(renderCheckRow).join("") : '<p id="checks-empty" class="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">まだ監視対象がありません。</p>'}
            </div>
          </div>

          <div class="grid gap-5">
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
          </div>
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
                ${data.recentIncidents.length > 0 ? data.recentIncidents.map((incident) => `
                  <tr id="incident-history-${incident.id}">
                    <td class="pr-4 font-medium text-slate-50">${escapeHtml(incident.check_name)}</td>
                    <td class="pr-4">${escapeHtml(incident.started_at)}</td>
                    <td class="pr-4">${escapeHtml(formatNullable(incident.resolved_at))}</td>
                    <td class="pr-4">${escapeHtml(formatDuration(incident.started_at, incident.resolved_at))}</td>
                    <td class="pr-4">${escapeHtml(formatNullable(incident.start_reason))}</td>
                    <td class="pr-4">${incident.resolved_at ? '<span class="font-semibold text-emerald-400">復旧</span>' : '<span class="font-semibold text-rose-400">継続中</span>'}</td>
                  </tr>
                `).join("") : '<tr id="incident-history-empty"><td colspan="6" class="py-4 text-slate-400">incident はまだありません。</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <p class="text-sm text-slate-400">Checked from Cloudflare edge. Check location is not fixed.</p>
      </div>
    </main>
    <footer class="mt-6 w-full border-t border-slate-800 bg-slate-950/85">
      <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-400 sm:px-6 lg:px-8">
        Edge Pulse
      </div>
    </footer>
  </body>
</html>`;
};

export const renderDashboardShell = (data: DashboardData): string => {
  const html = renderDashboardHtml(data);
  const match = html.match(/<main id="dashboard-shell"[^>]*>([\s\S]*)<\/main>/);
  return `<main id="dashboard-shell" class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">${match?.[1] ?? ""}</main>`;
};

export const renderDashboardPage = (data: DashboardData): Response => {
  return new Response(renderDashboardHtml(data), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

export type { DashboardData };
