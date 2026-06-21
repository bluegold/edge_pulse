export type CheckState = "unknown" | "ok" | "fail";

export type SummaryStats = {
  totalChecks: number;
  okChecks: number;
  failedChecks: number;
  incidents24h: number;
  averageLatencyMs: number | null;
};

export type CurrentIncidentView = {
  id: number;
  checkName: string;
  startedAtLabel: string;
  durationLabel: string;
  reasonLabel: string;
  lastCheckedAtLabel: string;
};

export type TimelineItemView = {
  id: number;
  checkName: string;
  startedAtLabel: string;
  resolvedAtLabel: string | null;
  durationLabel: string;
  status: "resolved" | "open";
  reasonLabel: string;
  lane: number;
  startPercent: number;
  endPercent: number;
};

export type MonitorRowView = {
  id: number;
  name: string;
  url: string;
  enabled: boolean;
  state: CheckState;
  latencyLabel: string;
  lastCheckedAtLabel: string;
  lastIncidentLabel: string;
};

export type IncidentHistoryRowView = {
  id: number;
  checkName: string;
  startedAtLabel: string;
  resolvedAtLabel: string;
  durationLabel: string;
  reasonLabel: string;
  statusLabel: "復旧" | "継続中" | "無視";
};

export type DashboardViewModel = {
  rangeLabel: "24h" | "7日" | "30日";
  stats: SummaryStats;
  currentIncidents: CurrentIncidentView[];
  timelineTicks: string[];
  timelineItems: TimelineItemView[];
  monitors: MonitorRowView[];
  incidentHistory: IncidentHistoryRowView[];
  generatedAtLabel: string;
};

const escapeHtml = (value: unknown): string => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const stateLabel = (state: CheckState, enabled: boolean): string => {
  if (!enabled) return "停止中";
  if (state === "ok") return "OK";
  if (state === "fail") return "障害中";
  return "未確認";
};

const stateClass = (state: CheckState, enabled: boolean): string => {
  if (!enabled) return "is-disabled";
  if (state === "ok") return "is-ok";
  if (state === "fail") return "is-fail";
  return "is-unknown";
};

export const renderDashboardPage = (model: DashboardViewModel): Response => {
  const html = renderLayout({
    title: "Uptime Monitor",
    body: renderDashboard(model),
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

export const renderLayout = (params: { title: string; body: string }): string => {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(params.title)}</title>
  <style>
    :root {
      --bg: #f7f7f8;
      --panel: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #d1d5db;
      --border-soft: #e5e7eb;
      --ok: #15803d;
      --ok-bg: #dcfce7;
      --fail: #b91c1c;
      --fail-bg: #fee2e2;
      --warn: #92400e;
      --warn-bg: #fef3c7;
      --unknown: #4b5563;
      --unknown-bg: #f3f4f6;
      --primary: #1d4ed8;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }

    a {
      color: inherit;
    }

    .dashboard {
      max-width: 1280px;
      margin: 0 auto;
      padding: 20px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }

    .app-title {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .search-input {
      min-width: 220px;
      height: 38px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
    }

    .button,
    .range-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 38px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
    }

    .range-link.is-active {
      border-color: var(--primary);
      color: var(--primary);
      font-weight: 700;
    }

    .button-primary {
      color: #fff;
      border-color: var(--primary);
      background: var(--primary);
      font-weight: 700;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary-card {
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
    }

    .summary-label {
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .summary-value {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .panel {
      margin-bottom: 16px;
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
    }

    .panel-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .panel-title {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
    }

    .panel-note {
      color: var(--muted);
      font-size: 13px;
    }

    .current-incidents {
      border-color: #fecaca;
      background: #fffafa;
    }

    .current-incident-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .incident-alert {
      padding: 12px;
      border: 1px solid #fecaca;
      border-radius: 10px;
      background: var(--fail-bg);
    }

    .incident-alert-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      font-weight: 800;
    }

    .incident-alert-meta {
      color: #7f1d1d;
      font-size: 13px;
    }

    .empty-state {
      margin: 0;
      padding: 12px;
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 10px;
      background: #fff;
    }

    .timeline-card {
      overflow: hidden;
    }

    .timeline {
      position: relative;
      height: 250px;
      padding: 28px 12px 18px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background:
        linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--border-soft) calc(25% - 1px), var(--border-soft) 25%, transparent 25%),
        linear-gradient(to right, transparent 0, transparent calc(50% - 1px), var(--border-soft) calc(50% - 1px), var(--border-soft) 50%, transparent 50%),
        linear-gradient(to right, transparent 0, transparent calc(75% - 1px), var(--border-soft) calc(75% - 1px), var(--border-soft) 75%, transparent 75%),
        #fff;
    }

    .timeline-axis {
      position: absolute;
      left: 24px;
      right: 24px;
      top: 104px;
      height: 2px;
      background: #9ca3af;
    }

    .timeline-now {
      position: absolute;
      right: 24px;
      top: 76px;
      bottom: 24px;
      width: 2px;
      background: var(--text);
    }

    .timeline-ticks {
      position: absolute;
      left: 24px;
      right: 24px;
      top: 72px;
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 12px;
    }

    .timeline-items {
      position: absolute;
      left: 24px;
      right: 24px;
      top: 0;
      bottom: 0;
    }

    .timeline-item {
      position: absolute;
      top: var(--top);
      left: var(--start);
      width: var(--width);
      min-width: 8px;
      height: 44px;
    }

    .timeline-line {
      position: absolute;
      left: 0;
      right: 0;
      top: 30px;
      height: 4px;
      border-radius: 999px;
      background: var(--fail);
    }

    .timeline-item.is-resolved .timeline-line {
      background: #f97316;
    }

    .timeline-item.is-open .timeline-line {
      background: var(--fail);
    }

    .timeline-marker {
      position: absolute;
      left: 0;
      top: 22px;
      width: 12px;
      height: 12px;
      border: 2px solid var(--fail);
      border-radius: 999px;
      background: #fff;
    }

    .timeline-label {
      position: absolute;
      left: 0;
      top: 0;
      max-width: 280px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding: 2px 6px;
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: #fff;
      font-size: 12px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
    }

    .timeline-footer-note {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 16px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th,
    td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--border-soft);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }

    .status-badge::before {
      content: "";
      display: block;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
    }

    .status-badge.is-ok {
      color: var(--ok);
      background: var(--ok-bg);
    }

    .status-badge.is-fail {
      color: var(--fail);
      background: var(--fail-bg);
    }

    .status-badge.is-unknown,
    .status-badge.is-disabled {
      color: var(--unknown);
      background: var(--unknown-bg);
    }

    .status-text-resolved {
      color: var(--ok);
      font-weight: 700;
    }

    .status-text-open {
      color: var(--fail);
      font-weight: 700;
    }

    .screen-note {
      margin: 16px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 920px) {
      .topbar {
        align-items: stretch;
        flex-direction: column;
      }

      .topbar-actions {
        justify-content: flex-start;
      }

      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .current-incident-list,
      .bottom-grid {
        grid-template-columns: 1fr;
      }

      .timeline {
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
${params.body}
</body>
</html>`;
};

export const renderDashboard = (model: DashboardViewModel): string => {
  return `<main class="dashboard">
  <header class="topbar">
    <h1 class="app-title">Uptime Monitor</h1>
    <div class="topbar-actions">
      <input class="search-input" name="q" type="search" placeholder="検索">
      ${renderRangeLink("24h", model.rangeLabel)}
      ${renderRangeLink("7日", model.rangeLabel)}
      ${renderRangeLink("30日", model.rangeLabel)}
      <a class="button" href="/">更新</a>
      <a class="button button-primary" href="/checks/new">+ 新規監視</a>
    </div>
  </header>

  <section class="summary-grid" aria-label="概要">
    ${renderSummaryCard("監視URL", String(model.stats.totalChecks))}
    ${renderSummaryCard("稼働中", String(model.stats.okChecks))}
    ${renderSummaryCard("障害中", String(model.stats.failedChecks))}
    ${renderSummaryCard("24h障害件数", String(model.stats.incidents24h))}
    ${renderSummaryCard("平均応答", model.stats.averageLatencyMs == null ? "-" : `${model.stats.averageLatencyMs}ms`)}
  </section>

  ${renderCurrentIncidents(model.currentIncidents)}

  <section class="panel timeline-card">
    <div class="panel-header">
      <h2 class="panel-title">障害タイムライン</h2>
      <span class="panel-note">左が過去 / 右が現在</span>
    </div>
    ${renderTimeline(model)}
    <p class="timeline-footer-note">復旧済みは短い注釈、継続中は上の警告欄で強調表示します。</p>
  </section>

  <section class="bottom-grid">
    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">監視対象一覧</h2>
      </div>
      ${renderMonitorTable(model.monitors)}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">障害履歴</h2>
      </div>
      ${renderIncidentHistoryTable(model.incidentHistory)}
    </section>
  </section>

  <p class="screen-note">
    Checked from Cloudflare edge. Check location is not fixed. Generated at ${escapeHtml(model.generatedAtLabel)}.
  </p>
</main>`;
};

const renderRangeLink = (label: DashboardViewModel["rangeLabel"], current: DashboardViewModel["rangeLabel"]): string => {
  const active = label === current ? " is-active" : "";
  return `<a class="range-link${active}" href="/?range=${encodeURIComponent(label)}">${escapeHtml(label)}</a>`;
};

const renderSummaryCard = (label: string, value: string): string => {
  return `<article class="summary-card">
    <p class="summary-label">${escapeHtml(label)}</p>
    <p class="summary-value">${escapeHtml(value)}</p>
  </article>`;
};

const renderCurrentIncidents = (items: CurrentIncidentView[]): string => {
  if (items.length === 0) {
    return `<section class="panel current-incidents">
      <div class="panel-header">
        <h2 class="panel-title">現在の障害</h2>
      </div>
      <p class="empty-state">現在継続中の障害はありません。</p>
    </section>`;
  }

  return `<section class="panel current-incidents">
    <div class="panel-header">
      <h2 class="panel-title">現在の障害</h2>
      <span class="panel-note">${items.length}件継続中</span>
    </div>
    <div class="current-incident-list">
      ${items.map(renderCurrentIncident).join("")}
    </div>
  </section>`;
};

const renderCurrentIncident = (item: CurrentIncidentView): string => {
  return `<article class="incident-alert">
    <div class="incident-alert-title">
      <span>⚠ ${escapeHtml(item.checkName)}</span>
      <span class="status-text-open">障害中</span>
    </div>
    <div class="incident-alert-meta">
      開始 ${escapeHtml(item.startedAtLabel)} /
      継続 ${escapeHtml(item.durationLabel)} /
      ${escapeHtml(item.reasonLabel)} /
      最終確認 ${escapeHtml(item.lastCheckedAtLabel)}
    </div>
  </article>`;
};

const renderTimeline = (model: DashboardViewModel): string => {
  return `<div class="timeline">
    <div class="timeline-ticks">
      ${model.timelineTicks.map((tick) => `<span>${escapeHtml(tick)}</span>`).join("")}
    </div>
    <div class="timeline-axis" aria-hidden="true"></div>
    <div class="timeline-now" aria-hidden="true"></div>
    <div class="timeline-items">
      ${model.timelineItems.map(renderTimelineItem).join("")}
    </div>
  </div>`;
};

const renderTimelineItem = (item: TimelineItemView): string => {
  const start = clampPercent(item.startPercent);
  const end = clampPercent(item.endPercent);
  const width = Math.max(1.2, end - start);
  const top = 118 + (item.lane % 4) * 30;
  const statusClass = item.status === "open" ? "is-open" : "is-resolved";
  const suffix = item.status === "open" ? "障害開始" : `障害 ${item.durationLabel}`;

  return `<div
    class="timeline-item ${statusClass}"
    style="--start: ${start.toFixed(3)}%; --width: ${width.toFixed(3)}%; --top: ${top}px;"
    title="${escapeHtml(item.checkName)} ${escapeHtml(suffix)}"
  >
    <div class="timeline-label">${escapeHtml(item.checkName)} ${escapeHtml(suffix)}</div>
    <div class="timeline-marker"></div>
    <div class="timeline-line"></div>
  </div>`;
};

const renderMonitorTable = (rows: MonitorRowView[]): string => {
  if (rows.length === 0) {
    return `<p class="empty-state">監視対象はまだ登録されていません。</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>URL</th>
          <th>状態</th>
          <th>応答</th>
          <th>最終確認</th>
          <th>直近障害</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderMonitorRow).join("")}
      </tbody>
    </table>
  </div>`;
};

const renderMonitorRow = (row: MonitorRowView): string => {
  const badgeClass = stateClass(row.state, row.enabled);
  const label = stateLabel(row.state, row.enabled);

  return `<tr>
    <td>${escapeHtml(row.name)}</td>
    <td><a href="${escapeHtml(row.url)}" rel="noreferrer">${escapeHtml(row.url)}</a></td>
    <td><span class="status-badge ${badgeClass}">${escapeHtml(label)}</span></td>
    <td>${escapeHtml(row.latencyLabel)}</td>
    <td>${escapeHtml(row.lastCheckedAtLabel)}</td>
    <td>${escapeHtml(row.lastIncidentLabel)}</td>
  </tr>`;
};

const renderIncidentHistoryTable = (rows: IncidentHistoryRowView[]): string => {
  if (rows.length === 0) {
    return `<p class="empty-state">障害履歴はまだありません。</p>`;
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>監視対象</th>
          <th>発生</th>
          <th>復旧</th>
          <th>継続時間</th>
          <th>原因</th>
          <th>状態</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderIncidentHistoryRow).join("")}
      </tbody>
    </table>
  </div>`;
};

const renderIncidentHistoryRow = (row: IncidentHistoryRowView): string => {
  const statusClass = row.statusLabel === "継続中" ? "status-text-open" : "status-text-resolved";

  return `<tr>
    <td>${escapeHtml(row.checkName)}</td>
    <td>${escapeHtml(row.startedAtLabel)}</td>
    <td>${escapeHtml(row.resolvedAtLabel)}</td>
    <td>${escapeHtml(row.durationLabel)}</td>
    <td>${escapeHtml(row.reasonLabel)}</td>
    <td><span class="${statusClass}">${escapeHtml(row.statusLabel)}</span></td>
  </tr>`;
};
