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
            radial-gradient(circle at top, rgba(56, 189, 248, 0.16), transparent 32%),
            linear-gradient(180deg, #020617 0%, #0f172a 100%);
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
          padding: 1.5rem 1rem;
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
      `}</style>
    </head>
    <body class="flex min-h-screen flex-col text-slate-100" hx-boost="true" hx-target="#content" hx-swap="outerHTML show:top">
      <a href="#content" class="skip-link">メインコンテンツへスキップ</a>
      <header class="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">Cloudflare Workers uptime monitor</p>
            <h1 class="mt-1 text-2xl font-black tracking-tight text-slate-50">Edge Pulse</h1>
          </div>
          <div class="flex items-center gap-2">
            <a
              href="/"
              aria-current={activeHref === "/" ? "page" : undefined}
              class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100"
            >概要</a>
            <a
              href="/checks"
              aria-current={activeHref === "/checks" ? "page" : undefined}
              class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100"
            >監視一覧</a>
          </div>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer class="mt-auto w-full border-t border-slate-800 bg-slate-950/85">
        <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-200 sm:px-6 lg:px-8">Edge Pulse</div>
      </footer>
    </body>
  </html>
);
