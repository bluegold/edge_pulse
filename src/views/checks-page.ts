import { html, raw } from "hono/html";
import type { ChecksPageData } from "../lib/checks-page-data";

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

const formatCertificateDays = (daysRemaining: number | null | undefined): string => {
  if (daysRemaining === null || daysRemaining === undefined) return "-";
  if (daysRemaining < 0) return `期限切れ ${Math.abs(daysRemaining)} 日前`;
  return `残り ${daysRemaining} 日`;
};

const renderCertificateBadge = (check: ChecksPageData["checks"][number]): string => {
  if (check.tls_last_error) {
    return '<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">証明書確認失敗</span>';
  }
  if (typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30) {
    return '<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">証明書要確認</span>';
  }
  if (check.tls_valid_to) {
    return '<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">証明書OK</span>';
  }
  return '<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">証明書未取得</span>';
};

const renderCertificateDetails = (check: ChecksPageData["checks"][number]): string => `
  <div>
    <dt class="text-slate-500">証明書</dt>
    <dd class="mt-1">
      <div class="flex flex-wrap items-center gap-2">
        <span>${escapeHtml(formatCertificateDays(check.tls_days_remaining))}</span>
        ${renderCertificateBadge(check)}
      </div>
      <div class="mt-1 text-slate-300">
        <div>有効期限: ${escapeHtml(formatNullable(check.tls_valid_to))}</div>
        <div>発行者: ${escapeHtml(formatNullable(check.tls_issuer))}</div>
      </div>
    </dd>
  </div>
`;

const renderDocument = (body: string): string => `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Edge Pulse / 監視一覧</title>
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
          <a href="/checks" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100">更新</a>
        </div>
      </div>
    </header>
    ${body}
    <script>
      (() => {
        const toggle = document.getElementById("checks-create-toggle");
        const panel = document.getElementById("checks-create-form-wrap");
        const close = document.getElementById("checks-create-close");
        if (!toggle || !panel) return;
        const open = () => {
          panel.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
        };
        const hide = () => {
          panel.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
        };
        toggle.addEventListener("click", () => {
          panel.hidden ? open() : hide();
        });
        close?.addEventListener("click", hide);
      })();
    </script>
    <footer class="mt-6 w-full border-t border-slate-800 bg-slate-950/85">
      <div class="mx-auto max-w-7xl px-4 py-4 text-sm text-slate-400 sm:px-6 lg:px-8">
        Edge Pulse
      </div>
    </footer>
  </body>
</html>`;

const renderPageShell = (body: string): string => `
  <main id="content" class="mx-auto max-w-7xl px-4 py-6 scroll-mt-20 sm:px-6 lg:px-8">
    ${body}
  </main>
`;

const renderStateBadge = (enabled: number, state: string): string => {
  if (!enabled) return '<span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">停止中</span>';
  if (state === "ok") return '<span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">OK</span>';
  if (state === "fail") return '<span class="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">障害中</span>';
  return '<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">未確認</span>';
};

const renderViewCard = (check: ChecksPageData["checks"][number], page: number) => `
  <article id="check-item-${check.id}" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-lg font-bold text-slate-50">${escapeHtml(check.name)}</h3>
          ${renderStateBadge(check.enabled, check.last_state)}
        </div>
        <p class="mt-2 break-all text-sm text-slate-400">${escapeHtml(check.url)}</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
          <a
            id="check-item-${check.id}-edit"
            href="/checks?page=${page}&edit=${check.id}"
            hx-get="/checks?page=${page}&edit=${check.id}"
            hx-target="#content"
            hx-swap="outerHTML show:top"
            class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100"
          >編集</a>
      </div>
    </div>

    <dl class="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
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
        <dt class="text-slate-500">threshold</dt>
        <dd class="mt-1">失敗 ${check.fail_threshold} / 復旧 ${check.recovery_threshold}</dd>
      </div>
      ${renderCertificateDetails(check)}
    </dl>
  </article>
`;

const renderEditCard = (check: ChecksPageData["checks"][number], page: number) => `
  <form
    id="check-item-${check.id}"
    class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"
    hx-post="/checks/${check.id}?page=${page}"
    hx-target="#content"
    hx-swap="outerHTML show:top"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-lg font-bold text-slate-50">監視対象を編集</h3>
        ${renderStateBadge(check.enabled, check.last_state)}
      </div>

      <div class="grid gap-3 xl:grid-cols-2">
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">名称</span>
          <input name="name" required value="${escapeHtml(check.name)}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">URL</span>
          <input name="url" required value="${escapeHtml(check.url)}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">間隔</span>
          <input name="interval_minutes" type="number" min="1" max="1440" value="${check.interval_minutes}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">状態</span>
          <select name="enabled" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100">
            <option value="1" ${check.enabled ? "selected" : ""}>有効</option>
            <option value="0" ${!check.enabled ? "selected" : ""}>無効</option>
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">失敗 threshold</span>
          <input name="fail_threshold" type="number" min="1" value="${check.fail_threshold}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">復旧 threshold</span>
          <input name="recovery_threshold" type="number" min="1" value="${check.recovery_threshold}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">期待 HTTP 最小</span>
          <input name="expected_status_min" type="number" min="100" max="599" value="${check.expected_status_min}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">期待 HTTP 最大</span>
          <input name="expected_status_max" type="number" min="100" max="599" value="${check.expected_status_max}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-300">timeout ms</span>
          <input name="timeout_ms" type="number" min="1000" max="120000" value="${check.timeout_ms}" class="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-slate-100" />
        </label>
      </div>

      <div class="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
        <div class="font-semibold text-slate-100">証明書</div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span>${escapeHtml(formatCertificateDays(check.tls_days_remaining))}</span>
          ${renderCertificateBadge(check)}
        </div>
        <div class="mt-2 text-slate-400">
          <div>有効期限: ${escapeHtml(formatNullable(check.tls_valid_to))}</div>
          <div>発行者: ${escapeHtml(formatNullable(check.tls_issuer))}</div>
          <div>取得時刻: ${escapeHtml(formatNullable(check.tls_last_checked_at))}</div>
          ${check.tls_last_error ? `<div>取得エラー: ${escapeHtml(check.tls_last_error)}</div>` : ""}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button id="check-item-${check.id}-save" class="inline-flex items-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950">保存</button>
        <a
          id="check-item-${check.id}-cancel"
          href="/checks?page=${page}"
          hx-get="/checks?page=${page}"
          hx-target="#content"
          hx-swap="outerHTML show:top"
          class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100"
        >キャンセル</a>
      </div>
    </div>
  </form>
`;

const renderCreateForm = (page: number) => `
  <div id="checks-create-form-wrap" hidden>
    <form id="checks-create-form" class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,0.8fr))_minmax(0,0.8fr)]" hx-post="/checks?page=${page}" hx-target="#content" hx-swap="outerHTML show:top">
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
        <div class="flex items-end gap-2">
          <button id="checks-create-submit" class="inline-flex h-10 w-full min-w-0 items-center justify-center rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 xl:self-end">追加</button>
          <button id="checks-create-close" type="button" class="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 text-sm font-semibold text-slate-100 xl:self-end">閉じる</button>
        </div>
      </form>
  </div>
`;

const renderPagination = (page: number, totalPages: number, totalChecks: number) => {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return `
    <section id="checks-pagination-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-bold text-slate-50">ページング</h2>
          <p class="text-sm text-slate-400">全 ${totalChecks} 件中 ${page} / ${totalPages} ページ</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${
            hasPrev
              ? `<a id="checks-pagination-prev" href="/checks?page=${prevPage}" hx-get="/checks?page=${prevPage}" hx-target="#content" hx-swap="outerHTML show:top" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100">前へ</a>`
              : `<span id="checks-pagination-prev" class="inline-flex items-center rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-600">前へ</span>`
          }
          <span id="checks-pagination-current" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100">${page} / ${totalPages}</span>
          ${
            hasNext
              ? `<a id="checks-pagination-next" href="/checks?page=${nextPage}" hx-get="/checks?page=${nextPage}" hx-target="#content" hx-swap="outerHTML show:top" class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100">次へ</a>`
              : `<span id="checks-pagination-next" class="inline-flex items-center rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-2 text-sm font-semibold text-slate-600">次へ</span>`
          }
        </div>
      </div>
    </section>
  `;
};

const renderChecksMain = (data: ChecksPageData): string => `
  <section id="checks-shell" class="w-full">
    <div class="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-950/60 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Monitor management</p>
          <h2 class="mt-2 text-3xl font-black tracking-tight text-slate-50">監視一覧と編集</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">一覧・編集・ページングはこちらで扱います。ダッシュボードは概要専用です。</p>
        </div>
        <button
          id="checks-create-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="checks-create-form-wrap"
          class="inline-flex items-center rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-100"
        >追加</button>
      </header>

      <section id="checks-list-panel" class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-50">監視対象</h2>
            <p class="text-sm text-slate-400">最新のチェック状況を見ながら編集できます。</p>
          </div>
          <span class="rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-200">${data.totalChecks} 件</span>
        </div>
        ${renderCreateForm(data.page)}
        <div id="checks-list" class="mt-4 grid gap-3">
          ${
            data.checks.length > 0
              ? data.checks
                  .map((check) => (data.editId === check.id ? renderEditCard(check, data.page) : renderViewCard(check, data.page)))
                  .join("")
              : '<p id="checks-empty" class="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-400">まだ監視対象がありません。</p>'
          }
        </div>
      </section>

      ${renderPagination(data.page, data.totalPages, data.totalChecks)}
    </div>
  </section>
`;

export const renderChecksHtml = (data: ChecksPageData): string => renderDocument(renderChecksMain(data));

export const renderChecksShell = (data: ChecksPageData): string => renderChecksMain(data);

export const renderChecksPage = async (data: ChecksPageData): Promise<Response> =>
  new Response(await html`${raw(renderChecksHtml(data))}`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export type { ChecksPageData };
