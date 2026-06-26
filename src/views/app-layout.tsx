import type { Child } from "hono/jsx";

type AppLayoutProps = {
  title: string;
  activeHref: "/" | "/checks";
  children: Child;
};

export const AppLayout = ({ title, activeHref, children }: AppLayoutProps) => (
  <html lang="ja">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
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
        .incident-history::before {
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
        .subpanel,
        .incident-history {
          position: relative;
          border: 1px solid rgba(56, 189, 248, 0.20);
          background: rgba(8, 19, 38, 0.72);
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
          border: 1px solid rgba(52, 211, 153, 0.4);
          background: rgba(16, 185, 129, 0.09);
          color: #6ee7b7;
        }
        .footerbar {
          border-top: 1px solid rgba(56, 189, 248, 0.16);
          background: rgba(2, 8, 23, 0.86);
          backdrop-filter: blur(18px);
        }
      `}</style>
    </head>
    <body class="flex min-h-screen flex-col text-slate-100" hx-boost="true" hx-target="#content" hx-swap="outerHTML show:top">
      <a id="skip-link" href="#content" class="skip-link">メインコンテンツへスキップ</a>
      <header class="topbar sticky top-0 z-50 w-full">
        <div class="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div class="flex items-center gap-4">
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" class="h-8 w-8" fill="none"><path d="M5 25h8l4-13 9 25 6-17h11" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.32em] text-sky-300">Cloudflare Workers uptime monitor</p>
              <h1 class="mt-0.5 text-3xl font-black tracking-tight text-slate-50">Edge Pulse</h1>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <nav class="hidden items-center gap-2 sm:flex" aria-label="Primary">
              <a
                id="nav-home-link"
                href="/"
                aria-current={activeHref === "/" ? "page" : undefined}
                class="nav-link text-sm"
              >概要</a>
              <a
                id="nav-checks-link"
                href="/checks"
                aria-current={activeHref === "/checks" ? "page" : undefined}
                class="nav-link text-sm"
              >監視一覧</a>
            </nav>
            <span class="hidden h-8 w-px bg-slate-700/70 sm:block"></span>
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
      <footer class="footerbar mt-auto w-full">
        <div class="mx-auto flex max-w-[92rem] flex-col gap-3 px-4 py-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div class="flex items-center gap-4">
            <span class="font-black text-sky-300">Edge Pulse</span>
            <span class="hidden h-5 w-px bg-slate-700 sm:block"></span>
            <span>Cloudflare Workers の可用性を、シンプルに・確実に。</span>
          </div>
          <div class="flex flex-wrap items-center gap-5">
            <span class="inline-flex items-center gap-2"><span class="ok-dot"></span>すべてのシステムは正常です</span>
          </div>
        </div>
      </footer>
    </body>
  </html>
);
