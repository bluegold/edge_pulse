import { renderToString } from "hono/jsx/dom/server";
import { renderDashboardShell, type DashboardData } from "./dashboard-page.ts";

const DashboardDocument = ({ data }: { data: DashboardData }) => (
  <html lang="ja">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Edge Pulse</title>
      <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      <script src="https://unpkg.com/htmx.org@1.9.12"></script>
      <style>{`
        :root { color-scheme: dark; }
        body {
          background:
            radial-gradient(circle at top, rgba(56, 189, 248, 0.16), transparent 32%),
            linear-gradient(180deg, #020617 0%, #0f172a 100%);
        }
      `}</style>
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
      <div dangerouslySetInnerHTML={{ __html: renderDashboardShell(data) }} />
      <footer class="mt-6 w-full border-t border-slate-800 bg-slate-950/85">
        <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-400 sm:px-6 lg:px-8">Edge Pulse</div>
      </footer>
    </body>
  </html>
);

export const renderDashboardPage = (data: DashboardData): Response =>
  new Response(renderToString(<DashboardDocument data={data} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export type { DashboardData };
