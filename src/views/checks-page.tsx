import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import type { ChecksPageData } from "../lib/checks-page-data";
import { LocalTime } from "./time.tsx";

const formatNullable = (value: string | number | null | undefined, fallback = "-"): string => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const formatCertificateDays = (daysRemaining: number | null | undefined): string => {
  if (daysRemaining === null || daysRemaining === undefined) return "-";
  if (daysRemaining < 0) return `期限切れ ${Math.abs(daysRemaining)} 日前`;
  return `残り ${daysRemaining} 日`;
};

const CertificateBadge = ({ check }: { check: ChecksPageData["checks"][number] }) => {
  if (check.tls_last_error) {
    return <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">証明書確認失敗</span>;
  }
  if (typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30) {
    return <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">証明書要確認</span>;
  }
  if (check.tls_valid_to) {
    return <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">証明書OK</span>;
  }
  return <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-950">証明書未取得</span>;
};

const StateBadge = ({ enabled, state }: { enabled: number; state: string }) => {
  if (!enabled) return <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-950">停止中</span>;
  if (state === "ok") return <span class="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-950">OK</span>;
  if (state === "fail") return <span class="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-950">障害中</span>;
  return <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-950">未確認</span>;
};

const CertificateDetails = ({ check }: { check: ChecksPageData["checks"][number] }) => (
  <div>
    <dt class="text-slate-300">証明書</dt>
    <dd class="mt-1">
      <div class="flex flex-wrap items-center gap-2">
        <span>{formatCertificateDays(check.tls_days_remaining)}</span>
        <CertificateBadge check={check} />
      </div>
      <div class="mt-1 text-slate-200">
        <div>
          有効期限: <LocalTime iso={check.tls_valid_to} class="whitespace-nowrap" />
        </div>
        <div>発行者: {formatNullable(check.tls_issuer)}</div>
      </div>
    </dd>
  </div>
);

const ViewCard = ({ check, page }: { check: ChecksPageData["checks"][number]; page: number }) => (
  <article id={`check-item-${check.id}`} class="glass-surface rounded-3xl p-5">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-lg font-bold text-slate-50">{check.name}</h3>
          <StateBadge enabled={check.enabled} state={check.last_state} />
        </div>
        <p class="mt-2 break-all text-sm text-slate-400">{check.url}</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <a
          id={`check-item-${check.id}-edit`}
          href={`/checks?page=${page}&edit=${check.id}`}
          hx-get={`/checks?page=${page}&edit=${check.id}`}
          hx-target="#content"
          hx-swap="outerHTML show:top"
          class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
        >
          編集
        </a>
      </div>
    </div>

    <dl class="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <dt class="text-slate-300">最終確認</dt>
        <dd class="mt-1"><LocalTime iso={check.last_checked_at} class="whitespace-nowrap" /></dd>
      </div>
      <div>
        <dt class="text-slate-300">HTTP / 遅延</dt>
        <dd class="mt-1">
          {formatNullable(check.last_status_code)} / {check.last_latency_ms === null ? "-" : `${check.last_latency_ms}ms`}
        </dd>
      </div>
      <div>
        <dt class="text-slate-300">間隔</dt>
        <dd class="mt-1">{check.interval_minutes} 分</dd>
      </div>
      <div>
        <dt class="text-slate-300">threshold</dt>
        <dd class="mt-1">
          失敗 {check.fail_threshold} / 復旧 {check.recovery_threshold}
        </dd>
      </div>
      <CertificateDetails check={check} />
    </dl>
  </article>
);

const EditCard = ({ check, page }: { check: ChecksPageData["checks"][number]; page: number }) => (
  <form
    id={`check-item-${check.id}`}
    class="glass-surface rounded-3xl p-5"
    hx-post={`/checks/${check.id}?page=${page}`}
    hx-target="#content"
    hx-swap="outerHTML show:top"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-lg font-bold text-slate-50">監視対象を編集</h3>
        <StateBadge enabled={check.enabled} state={check.last_state} />
      </div>

      <div class="grid gap-3 xl:grid-cols-2">
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">名称</span>
          <input name="name" required value={check.name} class="glass-input rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-400" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">URL</span>
          <input name="url" required value={check.url} class="glass-input rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-400" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">間隔</span>
          <input name="interval_minutes" type="number" min="1" max="1440" value={check.interval_minutes} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">状態</span>
          <select name="enabled" class="glass-input rounded-xl px-3 py-2 text-slate-100">
            <option value="1" selected={check.enabled === 1}>
              有効
            </option>
            <option value="0" selected={check.enabled === 0}>
              無効
            </option>
          </select>
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">失敗 threshold</span>
          <input name="fail_threshold" type="number" min="1" value={check.fail_threshold} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">復旧 threshold</span>
          <input name="recovery_threshold" type="number" min="1" value={check.recovery_threshold} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">期待 HTTP 最小</span>
          <input name="expected_status_min" type="number" min="100" max="599" value={check.expected_status_min} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">期待 HTTP 最大</span>
          <input name="expected_status_max" type="number" min="100" max="599" value={check.expected_status_max} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <label class="grid gap-1 text-sm">
          <span class="font-semibold text-slate-200">timeout ms</span>
          <input name="timeout_ms" type="number" min="1000" max="120000" value={check.timeout_ms} class="glass-input rounded-xl px-3 py-2 text-slate-100" />
        </label>
      </div>

      <div class="glass-surface rounded-2xl p-4 text-sm text-slate-200">
        <div class="font-semibold text-slate-100">証明書</div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span>{formatCertificateDays(check.tls_days_remaining)}</span>
          <CertificateBadge check={check} />
        </div>
        <div class="mt-2 text-slate-400">
          <div>
            有効期限: <LocalTime iso={check.tls_valid_to} class="whitespace-nowrap" />
          </div>
          <div>発行者: {formatNullable(check.tls_issuer)}</div>
          <div>
            取得時刻: <LocalTime iso={check.tls_last_checked_at} class="whitespace-nowrap" />
          </div>
          {check.tls_last_error ? <div>取得エラー: {check.tls_last_error}</div> : null}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button id={`check-item-${check.id}-save`} class="glass-button inline-flex items-center rounded-xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-950">
          保存
        </button>
        <a
          id={`check-item-${check.id}-cancel`}
          href={`/checks?page=${page}`}
          hx-get={`/checks?page=${page}`}
          hx-target="#content"
          hx-swap="outerHTML show:top"
          class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
        >
          キャンセル
        </a>
      </div>
    </div>
  </form>
);

const CreateForm = ({ page }: { page: number }) => (
  <div id="checks-create-form-wrap" hidden>
    <form
      id="checks-create-form"
      class="glass-surface mt-4 grid gap-3 rounded-3xl p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,0.8fr))_minmax(0,0.8fr)]"
      hx-post={`/checks?page=${page}`}
      hx-target="#content"
      hx-swap="outerHTML show:top"
    >
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">名称</span>
        <input name="name" required placeholder="payments.example.com" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-400" />
      </label>
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">URL</span>
        <input name="url" required placeholder="https://payments.example.com" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100 placeholder:text-slate-400" />
      </label>
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">間隔</span>
        <input name="interval_minutes" type="number" min="1" max="1440" value="5" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100" />
      </label>
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">失敗</span>
        <input name="fail_threshold" type="number" min="1" value="2" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100" />
      </label>
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">復旧</span>
        <input name="recovery_threshold" type="number" min="1" value="1" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100" />
      </label>
      <label class="grid min-w-0 gap-1 text-sm">
        <span class="font-semibold text-slate-200">状態</span>
        <select name="enabled" class="glass-input w-full min-w-0 rounded-xl px-3 py-2 text-slate-100">
          <option value="1">有効</option>
          <option value="0">無効</option>
        </select>
      </label>
      <div class="flex items-end gap-2">
        <button id="checks-create-submit" class="glass-button inline-flex h-10 w-full min-w-0 items-center justify-center rounded-xl bg-slate-50 px-4 text-sm font-semibold text-slate-950 xl:self-end">
          追加
        </button>
        <button id="checks-create-close" type="button" class="glass-button inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-slate-100 xl:self-end">
          閉じる
        </button>
      </div>
    </form>
  </div>
);

const Pagination = ({ page, totalPages, totalChecks }: { page: number; totalPages: number; totalChecks: number }) => {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <section id="checks-pagination-panel" class="glass-surface rounded-3xl p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-bold text-slate-50">ページング</h2>
          <p class="text-sm text-slate-400">
            全 {totalChecks} 件中 {page} / {totalPages} ページ
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          {hasPrev ? (
            <a
              id="checks-pagination-prev"
              href={`/checks?page=${prevPage}`}
              hx-get={`/checks?page=${prevPage}`}
              hx-target="#content"
              hx-swap="outerHTML show:top"
              class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
            >
              前へ
            </a>
          ) : (
            <span id="checks-pagination-prev" class="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-400">
              前へ
            </span>
          )}
          <span id="checks-pagination-current" class="inline-flex items-center rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100">
            {page} / {totalPages}
          </span>
          {hasNext ? (
            <a
              id="checks-pagination-next"
              href={`/checks?page=${nextPage}`}
              hx-get={`/checks?page=${nextPage}`}
              hx-target="#content"
              hx-swap="outerHTML show:top"
              class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
            >
              次へ
            </a>
          ) : (
            <span id="checks-pagination-next" class="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-400">
              次へ
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

const ChecksShell = ({ data }: { data: ChecksPageData }) => (
  <section id="checks-shell" class="w-full">
    <div class="glass-surface-elevated flex flex-col gap-4 rounded-[2rem] p-6">
      <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-slate-200">Monitor management</p>
          <h2 class="mt-2 text-3xl font-black tracking-tight text-slate-50">監視一覧と編集</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-200">一覧・編集・ページングはこちらで扱います。ダッシュボードは概要専用です。</p>
        </div>
        <button
          id="checks-create-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="checks-create-form-wrap"
          class="glass-button inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-100"
        >
          追加
        </button>
      </header>

      <section id="checks-list-panel" class="glass-surface rounded-3xl p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-50">監視対象</h2>
            <p class="text-sm text-slate-200">最新のチェック状況を見ながら編集できます。</p>
          </div>
          <span class="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">{data.totalChecks} 件</span>
        </div>
        <CreateForm page={data.page} />
        <div id="checks-list" class="mt-4 grid gap-3">
          {data.checks.length > 0 ? (
            data.checks.map((check) => (data.editId === check.id ? <EditCard check={check} page={data.page} /> : <ViewCard check={check} page={data.page} />))
          ) : (
            <p id="checks-empty" class="glass-surface rounded-2xl border border-dashed border-white/15 p-4 text-sm text-slate-200">
              まだ監視対象がありません。
            </p>
          )}
        </div>
      </section>

      <Pagination page={data.page} totalPages={data.totalPages} totalChecks={data.totalChecks} />
    </div>
  </section>
);

const ChecksDocument = ({ data }: { data: ChecksPageData }) => (
  <AppLayout title="Edge Pulse / 監視一覧" activeHref="/checks">
    <ChecksShell data={data} />
  </AppLayout>
);

export const renderChecksShell = (data: ChecksPageData): string => renderToString(<ChecksShell data={data} />);

export const renderChecksPage = (data: ChecksPageData): Response =>
  new Response(renderToString(<ChecksDocument data={data} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export type { ChecksPageData };
