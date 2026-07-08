import type { Child } from "hono/jsx";
import type { CloudflareAccessIdentity } from "../http/shared";

type AppLayoutProps = {
  title: string;
  activeHref: "/" | "/checks";
  footerStatus: "healthy" | "degraded";
  accessIdentity?: CloudflareAccessIdentity | null;
  resetScrollOnLoad?: boolean;
  children: Child;
};

const AccessBadge = ({ label, value }: { label: string; value: string }) => (
  <div class="hidden min-w-0 rounded-md border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left sm:block">
    <p class="text-[10px] font-black uppercase tracking-[0.28em] text-sky-300">{label}</p>
    <p class="mt-0.5 truncate text-xs font-semibold text-slate-100">{value}</p>
  </div>
);

export const AppLayout = ({ title, activeHref, footerStatus, accessIdentity, resetScrollOnLoad = false, children }: AppLayoutProps) => (
  <html lang="ja">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
      {resetScrollOnLoad ? (
        <script
          dangerouslySetInnerHTML={{
            __html: 'history.scrollRestoration = "manual"; window.scrollTo({ top: 0, left: 0, behavior: "auto" });',
          }}
        />
      ) : null}
      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      <script src="https://unpkg.com/htmx.org@1.9.12"></script>
      <style>{`
        :root {
          color-scheme: dark;
          --bg: #050b18;
          --panel: rgba(10, 22, 42, 0.88);
          --panel-strong: rgba(12, 27, 52, 0.94);
          --line: rgba(96, 165, 250, 0.22);
          --line-soft: rgba(148, 163, 184, 0.14);
          --text: #f8fafc;
          --muted: #a9b6ca;
          --blue: #38bdf8;
          --blue-2: #2563eb;
          --green: #34d399;
          --red: #fb7185;
        }
        * { box-sizing: border-box; }
        body {
          background:
            linear-gradient(rgba(56, 189, 248, 0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px),
            radial-gradient(circle at 12% 10%, rgba(56, 189, 248, 0.22), transparent 0, transparent 26rem),
            radial-gradient(circle at 86% 6%, rgba(37, 99, 235, 0.22), transparent 0, transparent 22rem),
            radial-gradient(circle at 62% 92%, rgba(14, 165, 233, 0.12), transparent 0, transparent 28rem),
            linear-gradient(180deg, #071123 0%, #030817 100%);
          background-size: 72px 72px, 72px 72px, auto, auto, auto, auto;
          font-family: Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 16px;
          line-height: 1.55;
          color: var(--text);
        }
        body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(2, 6, 23, 0), rgba(2, 6, 23, 0.42));
        }
        .skip-link {
          position: absolute;
          left: 1rem;
          top: 0.75rem;
          z-index: 60;
          transform: translateY(-160%);
          border-radius: 0.5rem;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #020617;
          padding: 0.75rem 1rem;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 0 12px 24px rgba(2, 6, 23, 0.35);
          transition: transform 160ms ease;
        }
        .skip-link:focus-visible { transform: translateY(0); }
        #content {
          width: min(100%, 92rem);
          margin-inline: auto;
          padding: 1.35rem 1rem 2rem;
          scroll-margin-top: 5rem;
        }
        @media (min-width: 640px) { #content { padding-inline: 1.5rem; } }
        #content :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
          outline: 2px solid #f8fafc;
          outline-offset: 3px;
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.35);
        }
        #content .text-slate-400,
        #content .text-slate-500,
        #content .text-slate-600 {
          color: #dbeafe !important;
        }
        #content .text-slate-300 {
          color: #f8fafc !important;
        }
        .htmx-indicator {
          opacity: 0;
          visibility: hidden;
          transition: opacity 140ms ease, visibility 140ms ease;
        }
        .htmx-request.htmx-indicator,
        .htmx-request .htmx-indicator {
          opacity: 1;
          visibility: visible;
        }
        .topbar {
          border-bottom: 1px solid rgba(56, 189, 248, 0.18);
          background: rgba(2, 8, 23, 0.86);
          backdrop-filter: blur(18px);
        }
        .brand-mark {
          display: grid;
          place-items: center;
          width: 3.25rem;
          height: 3.25rem;
          border-radius: 0.85rem;
          border: 1px solid rgba(56, 189, 248, 0.35);
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.46), rgba(2, 6, 23, 0.74));
          box-shadow: 0 0 26px rgba(37, 99, 235, 0.24), inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.55rem 0.75rem;
          border-radius: 0.35rem;
          color: #dbeafe;
          font-weight: 700;
          text-decoration: none;
        }
        .nav-link[aria-current="page"] { color: #7dd3fc; }
        .nav-link[aria-current="page"]::after {
          content: "";
          position: absolute;
          left: 0.75rem;
          right: 0.75rem;
          bottom: 0.2rem;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--blue), transparent);
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.8);
        }
        .icon-button {
          display: grid;
          place-items: center;
          width: 2.5rem;
          height: 2.5rem;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.55);
          border-radius: 0.45rem;
          color: #e2e8f0;
        }
        .dashboard-frame {
          border: 1px solid rgba(56, 189, 248, 0.25);
          background: linear-gradient(180deg, rgba(12, 27, 52, 0.78), rgba(5, 12, 27, 0.90));
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .section-head {
          position: relative;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          background: linear-gradient(90deg, rgba(14, 165, 233, 0.12), transparent 38%);
        }
        .section-head::before,
        .subpanel::before,
        .incident-history::before,
        .recent-check-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, var(--blue), rgba(37, 99, 235, 0));
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.65);
        }
        .glass-button {
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(8, 16, 32, 0.9));
          color: #e2e8f0;
          transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
          cursor: pointer;
        }
        .glass-button:hover {
          border-color: rgba(56, 189, 248, 0.45);
          background: rgba(15, 35, 64, 0.95);
        }
        .glass-surface,
        .glass-surface-elevated,
        .glass-input {
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(8, 19, 38, 0.72);
        }
        .glass-surface-elevated {
          background: linear-gradient(180deg, rgba(12, 27, 52, 0.82), rgba(5, 12, 27, 0.94));
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .glass-input {
          color: #f8fafc;
          accent-color: var(--blue);
        }
        .glass-input::placeholder {
          color: #94a3b8;
        }
        .glass-input:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .cert-recheck-grid {
          position: relative;
          isolation: isolate;
        }
        .cert-recheck-divider {
          display: none;
        }
        @media (min-width: 640px) {
          .cert-recheck-divider {
            display: block;
            position: absolute;
            top: 0.25rem;
            bottom: 0.25rem;
            left: 50%;
            width: 2px;
            transform: translateX(-1px);
            background: rgba(148, 163, 184, 0.45);
            box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.5);
            z-index: 1;
            pointer-events: none;
          }
          .cert-recheck-item:nth-child(odd) {
            padding-right: 1rem;
            position: relative;
            z-index: 2;
          }
          .cert-recheck-item:nth-child(even) {
            padding-left: 1rem;
            position: relative;
            z-index: 2;
          }
        }
        .graph-shell {
          position: relative;
        }
        .graph-frame {
          position: relative;
          min-height: 18rem;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 0.75rem;
          background: linear-gradient(180deg, rgba(8, 19, 38, 0.82), rgba(8, 19, 38, 0.58));
        }
        .graph-empty {
          display: grid;
          place-items: center;
          min-height: 18rem;
          padding: 1rem;
          text-align: center;
        }
        .graph-svg {
          display: block;
          width: 100%;
          height: 18rem;
          overflow: visible;
        }
        .graph-axis path,
        .graph-axis line {
          stroke: rgba(148, 163, 184, 0.24);
        }
        .graph-grid line {
          stroke: rgba(148, 163, 184, 0.12);
        }
        .graph-series {
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .graph-series-raw {
          opacity: 0.42;
        }
        .graph-series-smooth {
          stroke-width: 4.5;
          opacity: 1;
        }
        .graph-series.is-fail {
          stroke: rgba(248, 113, 113, 0.95);
        }
        .graph-series.is-ok {
          stroke: rgba(125, 211, 252, 0.95);
        }
        .graph-point {
          cursor: pointer;
        }
        .graph-point.is-fail {
          fill: rgba(248, 113, 113, 1);
          stroke: rgba(255, 255, 255, 0.7);
        }
        .graph-point.is-ok {
          fill: rgba(125, 211, 252, 1);
          stroke: rgba(255, 255, 255, 0.65);
        }
        .graph-hit {
          fill: transparent;
          cursor: pointer;
        }
        .graph-tooltip {
          position: absolute;
          z-index: 2;
          min-width: 14rem;
          max-width: 18rem;
          pointer-events: none;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 0.65rem;
          background: rgba(2, 8, 23, 0.96);
          padding: 0.65rem 0.75rem;
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.35);
          font-size: 0.78rem;
          color: #e2e8f0;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .graph-tooltip.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .graph-tooltip .graph-tooltip-title {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          font-weight: 800;
          margin-bottom: 0.45rem;
        }
        .graph-tooltip .graph-tooltip-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }
        .graph-tooltip .graph-tooltip-key {
          color: #94a3b8;
        }
        .graph-tooltip .graph-tooltip-value {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .shell {
          position: relative;
          border: 1px solid rgba(56, 189, 248, 0.23);
          background: linear-gradient(180deg, rgba(12, 27, 52, 0.76), rgba(5, 12, 27, 0.90));
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(90deg, rgba(14, 165, 233, 0.12), transparent 34%);
        }
        .summary-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(148, 163, 184, 0.08);
        }
        .checks-summary-strip {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
        .checks-search-cell {
          grid-column: span 2;
        }
        @media (max-width: 1024px) {
          .checks-summary-strip {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .checks-search-cell {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 760px) {
          .summary-strip { grid-template-columns: 1fr; }
        }
        .summary-cell {
          background: rgba(2, 8, 23, 0.28);
          padding: 1rem 1.4rem;
        }
        .summary-metric {
          display: flex;
          min-height: 100%;
          flex-direction: column;
          justify-content: space-between;
        }
        .summary-cell dt {
          font-size: 0.78rem;
          color: #94a3b8;
          font-weight: 750;
        }
        .summary-cell dd {
          margin: 0.25rem 0 0;
          font-size: 1.35rem;
          font-weight: 900;
          text-align: right;
        }
        .panel {
          position: relative;
          border: 1px solid rgba(56, 189, 248, 0.18);
          background: rgba(8, 19, 38, 0.72);
        }
        .checks-list-panel {
          position: relative;
          border: 0;
          background: transparent;
        }
        .panel-pad {
          padding: 1.25rem;
        }
        .panel-title {
          color: #f8fafc;
          letter-spacing: -0.02em;
        }
        .list {
          display: block;
        }
        .checks-table {
          width: 100%;
          min-width: 0;
          table-layout: fixed;
          border-collapse: separate;
          border-spacing: 0 0.25rem;
        }
        .checks-table col.check-actions-col {
          width: 8.25rem;
        }
        .checks-table thead th {
          padding: 0.75rem 1rem 1rem;
          text-align: left;
          font-size: 0.72rem;
          line-height: 1.35;
          color: #cbd5e1;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          background: rgba(148, 163, 184, 0.12);
        }
        .checks-table .check-row {
          position: relative;
          height: 100%;
        }
        .checks-table .check-row.off {
          opacity: 0.86;
        }
        .checks-table .check-row-highlight .check-main-cell,
        .checks-table .check-row-highlight .check-meta-cell,
        .checks-table .check-row-highlight .check-actions-cell {
          border-color: rgba(250, 204, 21, 0.42);
          background: linear-gradient(180deg, rgba(71, 54, 10, 0.68), rgba(12, 19, 24, 0.84));
          box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.08);
          animation: check-row-highlight 1800ms ease-out;
        }
        .check-main-cell,
        .check-meta-cell,
        .check-actions-cell {
          vertical-align: top;
          padding: 1.05rem 1rem;
          background: linear-gradient(180deg, rgba(8, 19, 38, 0.78), rgba(4, 11, 24, 0.78));
          border-top: 1px solid rgba(148, 163, 184, 0.14);
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
        }
        .check-main-cell {
          padding-inline: 0.7rem 1rem;
          padding-block: 1.15rem;
          background: linear-gradient(180deg, rgba(14, 33, 60, 0.96), rgba(7, 16, 31, 0.94));
          border-left: 1px solid rgba(148, 163, 184, 0.14);
          text-align: left;
        }
        .check-actions-cell {
          width: 8.25rem;
          min-width: 8.25rem;
          border-right: 1px solid rgba(148, 163, 184, 0.14);
          white-space: nowrap;
          text-align: right;
        }
        .check-meta-cell + .check-meta-cell {
          border-left: 1px solid rgba(148, 163, 184, 0.12);
        }
        .checks-table .check-row:hover .check-main-cell,
        .checks-table .check-row:hover .check-meta-cell,
        .checks-table .check-row:hover .check-actions-cell {
          border-color: rgba(56, 189, 248, 0.34);
          background: linear-gradient(180deg, rgba(11, 27, 52, 0.86), rgba(5, 14, 30, 0.84));
        }
        .check-meta-label {
          font-size: 0.72rem;
          line-height: 1.2;
          color: #94a3b8;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .check-meta-value {
          margin-top: 0.45rem;
          color: #f8fafc;
          font-weight: 800;
          white-space: normal;
        }
        @keyframes check-row-highlight {
          0% {
            background: linear-gradient(180deg, rgba(250, 204, 21, 0.34), rgba(12, 19, 24, 0.84));
          }
          100% {
            background: linear-gradient(180deg, rgba(8, 19, 38, 0.78), rgba(4, 11, 24, 0.78));
          }
        }
        .metric-stack {
          display: grid;
          gap: 0.4rem;
        }
        .metric-line {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.75rem;
        }
        .metric-label {
          font-size: 0.72rem;
          line-height: 1.2;
          color: #94a3b8;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .metric-value {
          text-align: right;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }
        .check-edit-cell {
          padding: 0;
        }
        .check-edit-form {
          padding: 0;
        }
        .check-edit-card {
          display: grid;
          gap: 1rem;
          padding: 0.85rem 0.75rem 0.75rem;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: linear-gradient(180deg, rgba(8, 19, 38, 0.72), rgba(4, 11, 24, 0.72));
        }
        .check-edit-top {
          display: grid;
          grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
          gap: 0.75rem;
          align-items: start;
        }
        .check-edit-main-block,
        .check-edit-side-block {
          display: grid;
          gap: 0.75rem;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .check-edit-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.75rem;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
        }
        .check-edit-field {
          display: grid;
          gap: 0.35rem;
        }
        .check-edit-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: flex-end;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
        }
        .status-range {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
          align-items: center;
          gap: 0.4rem;
        }
        .status-range-sep {
          color: #94a3b8;
          font-weight: 800;
        }
        .check-main {
          min-width: 0;
          margin: 0;
          text-align: left;
        }
        .check-name {
          font-size: 1.18rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .check-url {
          margin-top: 0.28rem;
          color: #dbeafe;
          word-break: break-all;
          font-size: 0.92rem;
          line-height: 1.45;
          text-align: left;
        }
        .sort-header {
          display: block;
          width: 100%;
          min-width: 0;
        }
        .sort-header-label {
          display: block;
          white-space: nowrap;
          font-size: 0.83rem;
          font-weight: 900;
          letter-spacing: 0.03em;
          color: #dbeafe;
        }
        .sort-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          width: 100%;
          padding: 0.3rem 0.55rem;
          border-radius: 999px;
          color: #94a3b8;
          font-weight: 850;
          text-decoration: none;
          transition: background 120ms ease, color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
        }
        .sort-toggle-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          flex: none;
        }
        .sort-toggle:hover {
          color: #e2e8f0;
          background: rgba(56, 189, 248, 0.14);
        }
        .sort-toggle.active {
          color: #e0f2fe;
          background: rgba(56, 189, 248, 0.22);
          box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.26);
        }
        .sort-toggle-icon {
          width: 0.95rem;
          height: 0.95rem;
          stroke-linecap: round;
          stroke-linejoin: round;
          flex: none;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border-radius: 0.35rem;
          padding: 0.25rem 0.55rem;
          font-size: 0.75rem;
          font-weight: 850;
        }
        .status.ok {
          border: 1px solid rgba(52, 211, 153, 0.35);
          background: rgba(16, 185, 129, 0.11);
          color: #86efac;
        }
        .status.off {
          border: 1px solid rgba(148, 163, 184, 0.20);
          background: rgba(148, 163, 184, 0.08);
          color: #e2e8f0;
        }
        .status.off.status-fail {
          border-color: rgba(251, 113, 133, 0.78);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.98), rgba(83, 7, 37, 0.98));
          color: #fff1f2;
          box-shadow:
            0 0 0 1px rgba(251, 113, 133, 0.12),
            0 10px 24px rgba(127, 29, 29, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .status.maintenance {
          border: 1px solid rgba(251, 191, 36, 0.36);
          background: rgba(245, 158, 11, 0.12);
          color: #fde68a;
        }
        .status.maintenance.overdue {
          border-color: rgba(248, 113, 113, 0.75);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.98), rgba(83, 7, 37, 0.98));
          color: #fff1f2;
          box-shadow:
            0 0 0 1px rgba(251, 113, 133, 0.12),
            0 10px 24px rgba(127, 29, 29, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .dot {
          width: 0.48rem;
          height: 0.48rem;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 10px currentColor;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          border-left: 1px solid rgba(148, 163, 184, 0.08);
          border-right: 1px solid rgba(148, 163, 184, 0.08);
        }
        .meta {
          padding: 1.1rem 0.95rem;
        }
        .meta + .meta {
          border-left: 1px solid rgba(148, 163, 184, 0.12);
        }
        .meta dt {
          font-size: 0.72rem;
          line-height: 1.2;
          color: #94a3b8;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .meta dd {
          margin: 0.45rem 0 0;
          color: #f8fafc;
          font-weight: 800;
          white-space: nowrap;
        }
        .meta .sub {
          display: block;
          margin-top: 0.12rem;
          color: #94a3b8;
          font-weight: 600;
          font-size: 0.82rem;
          white-space: normal;
        }
        .cert-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: #a7f3d0;
        }
        .cert-chip.warn { color: #e2e8f0; }
        .row-line {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, rgba(56, 189, 248, 0.95), rgba(37, 99, 235, 0.1));
        }
        .check-row.off .row-line {
          background: linear-gradient(180deg, rgba(148, 163, 184, 0.55), rgba(148, 163, 184, 0.05));
        }
        @media (max-width: 1100px) {
          .checks-table {
            min-width: 0;
          }
          .checks-table thead {
            display: none;
          }
          .checks-table,
          .checks-table tbody,
          .checks-table tr,
          .checks-table td {
            display: block;
            width: 100%;
          }
          .checks-table .check-row {
            margin-bottom: 0.7rem;
          }
          .check-main-cell,
          .check-meta-cell,
          .check-actions-cell {
            border-left: 1px solid rgba(148, 163, 184, 0.14);
            border-right: 1px solid rgba(148, 163, 184, 0.14);
            border-radius: 0;
          }
          .check-main-cell {
            border-top-left-radius: 0;
            border-top-right-radius: 0;
          }
          .check-actions-cell {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            text-align: left;
          }
          .check-edit-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .status-range {
            grid-template-columns: 1fr;
          }
          .status-range-sep {
            text-align: center;
          }
          .check-edit-top {
            grid-template-columns: 1fr;
          }
          .check-edit-actions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 640px) {
          .check-main-cell,
          .check-meta-cell,
          .check-actions-cell {
            padding: 0.9rem;
          }
          .check-edit-grid {
            grid-template-columns: 1fr;
          }
          .status-range {
            grid-template-columns: 1fr;
          }
        }
        .create-wrap[hidden] { display: none; }
        .create-form-top {
          display: grid;
          grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          padding-top: 1rem;
          margin-top: 1rem;
        }
        .create-block {
          display: grid;
          gap: 0.75rem;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .create-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: flex-end;
          padding-top: 0.25rem;
        }
        @media (max-width: 1200px) {
          .create-form-top { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .create-form-top { grid-template-columns: 1fr; }
        }
        label span {
          display: block;
          margin-bottom: 0.25rem;
          color: #cbd5e1;
          font-weight: 700;
          font-size: 0.82rem;
        }
        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .page-buttons {
          display: flex;
          gap: 0.45rem;
        }
        .metric-card {
          min-height: 8rem;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: linear-gradient(180deg, rgba(15, 32, 59, 0.78), rgba(8, 18, 36, 0.88));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
        }
        .metric-card .metric-icon {
          color: var(--blue);
          filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.5));
        }
        .metric-card.danger .metric-icon { color: var(--red); filter: drop-shadow(0 0 9px rgba(251, 113, 133, 0.42)); }
        .sparkline {
          height: 1.35rem;
          opacity: 0.95;
          background:
            linear-gradient(180deg, rgba(56, 189, 248, 0.0), rgba(56, 189, 248, 0.18)),
            url("data:image/svg+xml,%3Csvg width='150' height='24' viewBox='0 0 150 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 18L12 14L22 19L34 10L45 18L55 13L65 17L78 8L91 14L103 13L114 7L126 10L138 5L150 8' stroke='%2338bdf8' stroke-width='2'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
        }
        .flatline { height: 1px; background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.95), transparent); }
        .auto-reload-ring {
          background: conic-gradient(#38bdf8 calc(var(--auto-progress, 0) * 1%), rgba(148, 163, 184, 0.2) 0);
        }
        .status-strip {
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          background: linear-gradient(90deg, rgba(16, 185, 129, 0.08), rgba(14, 165, 233, 0.03), transparent);
        }
        .dashboard-divider {
          display: flex;
          align-items: center;
          gap: 0.9rem;
          margin: 0.25rem 0;
          padding: 0.85rem 1.5rem;
          border-top: 1px solid rgba(56, 189, 248, 0.18);
          border-bottom: 1px solid rgba(56, 189, 248, 0.10);
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.12), rgba(8, 19, 38, 0.08) 24%, rgba(8, 19, 38, 0.08) 76%, rgba(56, 189, 248, 0.12));
        }
        .dashboard-divider::before,
        .dashboard-divider::after {
          content: "";
          flex: 1;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.95));
          opacity: 1;
        }
        .dashboard-divider::after {
          background: linear-gradient(90deg, rgba(125, 211, 252, 0.95), transparent);
        }
        .dashboard-divider > span {
          width: 0.85rem;
          height: 0.85rem;
          flex: 0 0 auto;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.68);
          background: radial-gradient(circle, rgba(125, 211, 252, 1), rgba(56, 189, 248, 0.28) 62%, transparent 70%);
          box-shadow: 0 0 24px rgba(56, 189, 248, 0.72);
        }
        .subpanel,
        .incident-history {
          position: relative;
          border: 0;
          background: transparent;
        }
        .recent-check-card {
          position: relative;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: linear-gradient(180deg, rgba(12, 27, 52, 0.88), rgba(8, 19, 38, 0.72));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .panel-title { color: #f8fafc; letter-spacing: -0.02em; }
        .table-wrap {
          border: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(2, 8, 23, 0.28);
        }
        table { border-collapse: collapse; }
        thead { background: rgba(148, 163, 184, 0.06); color: #cbd5e1; }
        th { white-space: nowrap; font-size: 0.83rem; letter-spacing: 0.03em; }
        td { border-top: 1px solid rgba(148, 163, 184, 0.10); color: #dbeafe; }
        .ok-dot {
          display: inline-block;
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 999px;
          background: var(--green);
          box-shadow: 0 0 12px rgba(52, 211, 153, 0.58);
        }
        .status-mark,
        .result-mark,
        .state-mark {
          display: inline-grid;
          place-items: center;
          width: 1rem;
          height: 1rem;
          border-radius: 0.15rem;
          font-size: 0.78rem;
          line-height: 1;
          font-weight: 900;
          flex: 0 0 auto;
        }
        .result-mark,
        .state-mark {
          border: 1px solid rgba(52, 211, 153, 0.35);
          background: rgba(16, 185, 129, 0.12);
          color: #86efac;
        }
        .result-mark.fail {
          border-color: rgba(251, 113, 133, 0.72);
          background: rgba(127, 29, 29, 0.96);
          color: #fff1f2;
        }
        .state-mark {
          border-color: rgba(56, 189, 248, 0.32);
          background: rgba(14, 165, 233, 0.12);
          color: #e0f2fe;
        }
        .state-mark.fail {
          border-color: rgba(251, 113, 133, 0.72);
          background: rgba(127, 29, 29, 0.96);
          color: #fff1f2;
        }
        .empty-state {
          min-height: 10.5rem;
          display: grid;
          place-items: center;
          text-align: center;
          color: #cbd5e1;
        }
        .empty-icon {
          display: grid;
          place-items: center;
          width: 3.9rem;
          height: 3.9rem;
          margin-inline: auto;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: radial-gradient(circle, rgba(56, 189, 248, 0.18), rgba(15, 23, 42, 0.72));
          color: #dbeafe;
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border: 1px solid rgba(52, 211, 153, 0.45);
          border-radius: 999px;
          padding: 0.45rem 0.85rem;
          background: rgba(6, 95, 70, 0.18);
          color: #bbf7d0;
          font-weight: 800;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .status-badge.degraded {
          border-color: rgba(251, 113, 133, 0.78);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.98), rgba(83, 7, 37, 0.98));
          color: #fff1f2;
          box-shadow:
            0 0 0 1px rgba(251, 113, 133, 0.12),
            0 10px 24px rgba(127, 29, 29, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .current-incident-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          border: 1px solid rgba(251, 113, 133, 0.78);
          background: linear-gradient(180deg, rgba(127, 29, 29, 0.98), rgba(83, 7, 37, 0.98));
          color: #fff1f2;
          box-shadow:
            0 0 0 1px rgba(251, 113, 133, 0.12),
            0 10px 24px rgba(127, 29, 29, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .current-incident-badge .state-mark.fail {
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
        }
        .status-badge .dot {
          width: 0.56rem;
          height: 0.56rem;
          box-shadow: 0 0 10px currentColor;
        }
        .footerbar {
          border-top: 1px solid rgba(56, 189, 248, 0.16);
          background: rgba(2, 8, 23, 0.86);
          backdrop-filter: blur(18px);
        }
      `}</style>
    </head>
    <body class="flex min-h-screen flex-col text-slate-100" hx-boost="true" hx-target="#content" hx-swap="outerHTML show:none">
      <a id="skip-link" href="#content" class="skip-link">メインコンテンツへスキップ</a>
      <header class="topbar sticky top-0 z-50 w-full">
        <div class="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="Edge Pulse ホーム" class="flex items-center gap-4 text-inherit no-underline">
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" class="h-8 w-8" fill="none"><path d="M5 25h8l4-13 9 25 6-17h11" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.32em] text-sky-300">Cloudflare Workers uptime monitor</p>
              <h1 class="mt-0.5 text-3xl font-black tracking-tight text-slate-50">Edge Pulse</h1>
            </div>
          </a>
          <div class="flex items-center gap-3">
            <nav class="hidden items-center gap-2 sm:flex" aria-label="Primary">
              <a
                id="nav-checks-link"
                href="/checks"
                aria-current={activeHref === "/checks" ? "page" : undefined}
                class="nav-link text-sm"
              >監視一覧</a>
            </nav>
            <span class="hidden h-8 w-px bg-slate-700/70 sm:block"></span>
            {accessIdentity ? (
              <div class="hidden items-center gap-3 lg:flex">
                <AccessBadge label="USER" value={accessIdentity.displayName === accessIdentity.email ? accessIdentity.displayName : accessIdentity.email ?? accessIdentity.displayName} />
              </div>
            ) : null}
            <button id="topbar-notify-button" class="icon-button" aria-label="通知">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <button id="topbar-theme-button" class="icon-button" aria-label="表示モード">
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/></svg>
            </button>
          </div>
        </div>
      </header>
      <main id="content">{children}</main>
      <script src="/assets/auto-reload.js" defer></script>
      <script id="checks-page-controls" src="/assets/checks-page.js" defer></script>
      <script type="module" src="/assets/check-detail-graphs.js" defer></script>
      <footer class="footerbar mt-auto w-full">
        <div class="mx-auto flex max-w-[92rem] flex-col gap-3 px-4 py-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div class="flex items-center gap-4">
            <span class="font-black text-sky-300">Edge Pulse</span>
            <span class="hidden h-5 w-px bg-slate-700 sm:block"></span>
            <span>Cloudflare Workers の可用性を、シンプルに・確実に。</span>
          </div>
          <div class="flex flex-wrap items-center gap-5">
            {footerStatus === "healthy" ? (
              <span class="status-badge">
                <span class="ok-dot"></span>
                すべてのシステムは正常です
              </span>
            ) : (
              <span class="status-badge degraded">
                <span class="dot"></span>一部のシステムで障害を検知しています
              </span>
            )}
          </div>
        </div>
      </footer>
    </body>
  </html>
);
