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
        :root { color-scheme: dark; }
        body {
          background:
            radial-gradient(circle at 15% 20%, rgba(255, 255, 255, 0.08), transparent 0, transparent 26%),
            radial-gradient(circle at 80% 12%, rgba(219, 39, 119, 0.16), transparent 0, transparent 18%),
            radial-gradient(circle at 70% 78%, rgba(37, 99, 235, 0.16), transparent 0, transparent 22%),
            radial-gradient(circle at 8% 88%, rgba(168, 85, 247, 0.12), transparent 0, transparent 18%),
            linear-gradient(180deg, #0b1326 0%, #060e20 100%);
          font-family: Inter, "Segoe UI", system-ui, sans-serif;
          font-size: 16px;
          line-height: 1.6;
        }
        .skip-link {
          position: absolute;
          left: 1rem;
          top: 0.75rem;
          z-index: 60;
          transform: translateY(-160%);
          border-radius: 0.75rem;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #020617;
          padding: 0.75rem 1rem;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 0 12px 24px rgba(2, 6, 23, 0.35);
          transition: transform 160ms ease;
        }
        .skip-link:focus-visible {
          transform: translateY(0);
        }
        #content {
          width: min(100%, 80rem);
          margin-inline: auto;
          padding: 1.5rem 1rem 2rem;
          scroll-margin-top: 5rem;
        }
        @media (min-width: 640px) {
          #content {
            padding-inline: 1.5rem;
          }
        }
        #content .text-slate-400,
        #content .text-slate-500,
        #content .text-slate-600 {
          color: #e2e8f0 !important;
        }
        #content .text-slate-300 {
          color: #f8fafc !important;
        }
        #content .text-xs,
        #content .text-sm {
          font-size: 1rem !important;
        }
        #content ::placeholder {
          color: #cbd5e1 !important;
          opacity: 1;
        }
        #content :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
          outline: 3px solid #f8fafc;
          outline-offset: 4px;
          box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.45);
        }
        #content .glass-surface {
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: #131b2e;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
        }
        #content .glass-surface-elevated {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #171f33;
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
        }
        #content .glass-button {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #1b2438;
        }
        #content .glass-button:hover {
          background: #24304a;
        }
        #content .glass-input {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: #0f172a;
        }
        #content .auto-reload-ring {
          background: conic-gradient(#38bdf8 calc(var(--auto-progress, 0) * 1%), rgba(148, 163, 184, 0.2) 0);
        }
      `}</style>
    </head>
    <body class="flex min-h-screen flex-col text-slate-100" hx-boost="true" hx-target="#content" hx-swap="outerHTML show:top">
      <a href="#content" class="skip-link">メインコンテンツへスキップ</a>
      <header class="sticky top-0 z-50 w-full border-b border-white/15 bg-slate-950/95">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">Cloudflare Workers uptime monitor</p>
            <h1 class="mt-1 text-2xl font-black tracking-tight text-slate-50">Edge Pulse</h1>
          </div>
          <div class="flex items-center gap-2">
            <a
              href="/"
              aria-current={activeHref === "/" ? "page" : undefined}
              class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
            >概要</a>
            <a
              href="/checks"
              aria-current={activeHref === "/checks" ? "page" : undefined}
              class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
            >監視一覧</a>
          </div>
        </div>
      </header>
      <main id="content">{children}</main>
      <script src="/assets/auto-reload.js" defer></script>
      <footer class="mt-auto w-full border-t border-white/15 bg-slate-950/95">
        <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-100 sm:px-6 lg:px-8">Edge Pulse</div>
      </footer>
    </body>
  </html>
);
