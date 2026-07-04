import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import type { ChecksPageData as ChecksPageDataType } from "../store/checks";
import { buildChecksUrl } from "../lib/checks-search";
import { LocalTime } from "./time.tsx";
import { formatNullable } from "../presenters/common";
import { describeCertificateBadge, describeCheckState } from "../presenters/checks";

export type ChecksPageData = ChecksPageDataType;

const CertificateBadge = ({ check }: { check: ChecksPageData["checks"][number] }) => {
  const badge = describeCertificateBadge(check);
  return <span class={badge.className}>{badge.label}</span>;
};

const StateBadge = ({ enabled, state }: { enabled: number; state: ChecksPageData["checks"][number]["last_state"] }) => {
  const badge = describeCheckState(enabled, state);
  return (
    <span class={badge.className}>
      <span class="dot"></span>
      {badge.label}
    </span>
  );
};

const CertificateDetails = ({ check }: { check: ChecksPageData["checks"][number] }) => (
  <div>
    <dt>証明書</dt>
    <dd class="mt-1">
      <CertificateBadge check={check} />
    </dd>
  </div>
);

const HX_SWAP_NO_SCROLL = "outerHTML show:none";

const SearchPanel = ({ q, filter, searchError }: { q: string; filter: string; searchError: string | null }) => (
  <div class="summary-cell checks-search-cell min-w-0">
    <form
      id="checks-search-form"
      class="grid gap-3"
      action="/checks"
      method="get"
      hx-get="/checks"
      hx-trigger="submit, change from:select"
      hx-target="#content"
      hx-swap={HX_SWAP_NO_SCROLL}
    >
      <p class="text-sm font-bold tracking-wide text-slate-200">検索</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="q"
          value={q}
          placeholder="name, url, state..."
          class="glass-input w-full rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400"
        />
        <select name="filter" class="glass-input min-w-0 rounded-md px-3 py-2 text-slate-100">
          <option value="" selected={filter === ""}>
            すべて
          </option>
          <option value="(&(enabled=1)(last_state=ok))" selected={filter === "(&(enabled=1)(last_state=ok))"}>
            稼働中
          </option>
          <option value="(&(enabled=1)(last_state=fail))" selected={filter === "(&(enabled=1)(last_state=fail))"}>
            障害中
          </option>
          <option value="(&(enabled=1)(cert_expiring_soon=1))" selected={filter === "(&(enabled=1)(cert_expiring_soon=1))"}>
            証明書30日以内
          </option>
          <option value="(recent_incident_24h=1)" selected={filter === "(recent_incident_24h=1)"}>
            24h障害件数
          </option>
        </select>
      </div>
      {searchError ? (
        <p id="checks-search-error" class="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {searchError}
        </p>
      ) : null}
    </form>
  </div>
);

const ViewCard = ({
  check,
  page,
  q,
  filter,
  highlighted,
}: {
  check: ChecksPageData["checks"][number];
  page: number;
  q: string;
  filter: string;
  highlighted: boolean;
}) => (
  <tr id={`check-item-${check.id}`} class={`check-row ${check.enabled ? "" : "off"} ${highlighted ? "check-row-highlight" : ""}`}>
    <th scope="row" class="check-main-cell">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="check-name truncate">
          <a href={`/checks/${check.id}`} class="hover:underline">
            {check.name}
          </a>
        </h3>
        <StateBadge enabled={check.enabled} state={check.last_state} />
      </div>
      <p class="check-url">{check.url}</p>
    </th>
    <td class="check-meta-cell">
      <div class="check-meta-value"><LocalTime iso={check.last_checked_at} class="whitespace-nowrap" /></div>
    </td>
    <td class="check-meta-cell">
      <div class="metric-stack">
        <div class="metric-line">
          <span class="metric-label">HTTP</span>
          <span class="metric-value">{formatNullable(check.last_status_code)}</span>
        </div>
        <div class="metric-line">
          <span class="metric-label">遅延</span>
          <span class="metric-value">{check.last_latency_ms === null ? "-" : `${check.last_latency_ms}ms`}</span>
        </div>
      </div>
    </td>
    <td class="check-meta-cell">
      <div class="check-meta-value text-right">{check.interval_minutes} 分</div>
    </td>
    <td class="check-meta-cell">
      <div class="metric-stack">
        <div class="metric-line">
          <span class="metric-label">失敗</span>
          <span class="metric-value">{check.fail_threshold}</span>
        </div>
        <div class="metric-line">
          <span class="metric-label">復旧</span>
          <span class="metric-value">{check.recovery_threshold}</span>
        </div>
      </div>
    </td>
    <td class="check-meta-cell">
      <div class="check-meta-value">
        <CertificateBadge check={check} />
      </div>
    </td>
    <td class="check-actions-cell">
      <a
        id={`check-item-${check.id}-edit`}
        href={buildChecksUrl({ page, edit: check.id, focus: check.id, q, filter })}
        hx-get={buildChecksUrl({ page, edit: check.id, focus: check.id, q, filter })}
        hx-target="#content"
        hx-swap={HX_SWAP_NO_SCROLL}
        class="glass-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100"
      >
        編集
      </a>
    </td>
  </tr>
);

const EditCard = ({
  check,
  page,
  q,
  filter,
}: {
  check: ChecksPageData["checks"][number];
  page: number;
  q: string;
  filter: string;
}) => (
  <tr id={`check-item-${check.id}`} class="check-row check-row-edit">
    <td colSpan={7} class="check-edit-cell">
      <form
        id={`check-item-${check.id}-form`}
        class="check-edit-form"
        hx-post={buildChecksUrl({ page, q, filter }).replace("/checks", `/checks/${check.id}`)}
        hx-target="#content"
        hx-swap={HX_SWAP_NO_SCROLL}
      >
        <div class="check-edit-card">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="check-name">監視対象を編集</h3>
              <p class="check-url">{check.url}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button id={`check-item-${check.id}-save`} class="glass-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100">
                保存
              </button>
              <a
                id={`check-item-${check.id}-cancel`}
                href={buildChecksUrl({ page, focus: check.id, q, filter })}
                hx-get={buildChecksUrl({ page, focus: check.id, q, filter })}
                hx-target="#content"
                hx-swap={HX_SWAP_NO_SCROLL}
                class="glass-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100"
              >
                キャンセル
              </a>
            </div>
          </div>

          <div class="check-edit-top">
            <div class="check-edit-main-block">
              <label class="check-edit-field">
                <span class="check-meta-label">名称</span>
                <input name="name" required value={check.name} class="glass-input rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400" />
              </label>
              <label class="check-edit-field">
                <span class="check-meta-label">URL</span>
                <input name="url" required value={check.url} class="glass-input rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400" />
              </label>
            </div>
            <div class="check-edit-side-block">
              <label class="check-edit-field">
                <span class="check-meta-label">間隔 (分)</span>
                <input name="interval_minutes" type="number" min="1" max="1440" value={check.interval_minutes} class="glass-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
              </label>
              <label class="check-edit-field">
                <span class="check-meta-label">状態</span>
                <select name="enabled" class="glass-input rounded-md px-3 py-2 text-slate-100">
                  <option value="1" selected={check.enabled === 1}>
                    有効
                  </option>
                  <option value="0" selected={check.enabled === 0}>
                    無効
                  </option>
                </select>
              </label>
            </div>
          </div>

          <div class="check-edit-grid">
            <label class="check-edit-field">
              <span class="check-meta-label">失敗</span>
              <input name="fail_threshold" type="number" min="1" value={check.fail_threshold} class="glass-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
            </label>
            <label class="check-edit-field">
              <span class="check-meta-label">復旧</span>
              <input name="recovery_threshold" type="number" min="1" value={check.recovery_threshold} class="glass-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
            </label>
            <label class="check-edit-field">
              <span class="check-meta-label">timeout</span>
              <input name="timeout_ms" type="number" min="1000" max="120000" value={check.timeout_ms} class="glass-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
            </label>
            <div class="check-edit-field">
              <span class="check-meta-label">成功とみなす HTTP ステータス</span>
              <div class="status-range">
                <input
                  name="expected_status_min"
                  type="number"
                  min="100"
                  max="599"
                  value={check.expected_status_min}
                  class="glass-input min-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums"
                />
                <span class="status-range-sep">〜</span>
                <input
                  name="expected_status_max"
                  type="number"
                  min="100"
                  max="599"
                  value={check.expected_status_max}
                  class="glass-input max-input rounded-md px-3 py-2 text-right text-slate-100 tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </td>
  </tr>
);

const CreateForm = ({ page, q, filter }: { page: number; q: string; filter: string }) => (
  <div id="checks-create-form-wrap" hidden>
    <form
      id="checks-create-form"
      class="table-wrap mt-4 grid gap-3 p-4"
      hx-post={buildChecksUrl({ page, q, filter })}
      hx-target="#content"
      hx-swap={HX_SWAP_NO_SCROLL}
    >
      <div class="create-form-top">
        <div class="create-block">
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">名称</span>
            <input name="name" required placeholder="payments.example.com" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400" />
          </label>
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">URL</span>
            <input name="url" required placeholder="https://payments.example.com" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400" />
          </label>
        </div>
        <div class="create-block">
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">状態</span>
            <select name="enabled" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-slate-100">
              <option value="1">有効</option>
              <option value="0">無効</option>
            </select>
          </label>
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">間隔</span>
            <input name="interval_minutes" type="number" min="1" max="1440" value="5" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
          </label>
        </div>
        <div class="create-block">
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">失敗</span>
            <input name="fail_threshold" type="number" min="1" value="2" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
          </label>
          <label class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">復旧</span>
            <input name="recovery_threshold" type="number" min="1" value="1" class="glass-input w-full min-w-0 rounded-md px-3 py-2 text-right text-slate-100 tabular-nums" />
          </label>
        </div>
      </div>
      <div class="create-form-actions">
        <button id="checks-create-submit" class="glass-button inline-flex h-10 items-center justify-center rounded-md bg-slate-50 px-4 text-sm font-semibold text-slate-950">
          追加
        </button>
        <button id="checks-create-close" type="button" class="glass-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100">
          閉じる
        </button>
      </div>
    </form>
  </div>
);

const Pagination = ({
  page,
  totalPages,
  totalChecks,
  q,
  filter,
}: {
  page: number;
  totalPages: number;
  totalChecks: number;
  q: string;
  filter: string;
}) => {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <section id="checks-pagination-panel" class="panel panel-pad">
      <div class="pagination">
        <div>
          <p class="text-sm muted">
            全 {totalChecks} 件中 {page} / {totalPages}
          </p>
        </div>
        <div class="page-buttons">
          {hasPrev ? (
            <a
              id="checks-pagination-prev"
              href={buildChecksUrl({ page: prevPage, q, filter })}
              hx-get={buildChecksUrl({ page: prevPage, q, filter })}
              hx-target="#content"
              hx-swap={HX_SWAP_NO_SCROLL}
              class="glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100"
            >
              前へ
            </a>
          ) : (
            <span id="checks-pagination-prev" class="glass-button opacity-55">
              前へ
            </span>
          )}
          <span id="checks-pagination-current" class="glass-button">
            {page} / {totalPages}
          </span>
          {hasNext ? (
            <a
              id="checks-pagination-next"
              href={buildChecksUrl({ page: nextPage, q, filter })}
              hx-get={buildChecksUrl({ page: nextPage, q, filter })}
              hx-target="#content"
              hx-swap={HX_SWAP_NO_SCROLL}
              class="glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100"
            >
              次へ
            </a>
          ) : (
            <span id="checks-pagination-next" class="glass-button opacity-55">
              次へ
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

const ChecksShell = ({ data }: { data: ChecksPageData }) => (
  <section
    id="checks-shell"
    class="w-full"
    data-focus-check-id={String(data.editId ?? data.highlightId ?? "")}
  >
    <div class="shell">
      <header class="section-head flex flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm font-bold uppercase tracking-[0.28em] text-sky-300">Monitor management</p>
          <h2 class="mt-3 text-3xl font-black tracking-tight text-slate-50">監視一覧と編集</h2>
          <p class="mt-3 max-w-2xl text-sm text-slate-300">一覧・編集はこちらで扱います。ダッシュボードは概要専用です。</p>
        </div>
        <button
          id="checks-create-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="checks-create-form-wrap"
          class="glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100"
        >
          追加
        </button>
      </header>

      <div class="summary-strip checks-summary-strip" aria-label="監視対象の概要">
        <div class="summary-cell">
          <div class="summary-metric">
            <dt>登録数</dt>
            <dd>{data.totalChecks} 件</dd>
          </div>
        </div>
        <div class="summary-cell">
          <div class="summary-metric">
            <dt>稼働中</dt>
            <dd><span class="text-emerald-300">{data.checks.filter((check) => check.enabled && check.last_state === "ok").length}</span> / {data.totalChecks}</dd>
          </div>
        </div>
        <div class="summary-cell">
          <div class="summary-metric">
            <dt>停止中</dt>
            <dd>{data.checks.filter((check) => !check.enabled).length}</dd>
          </div>
        </div>
        <SearchPanel q={data.q} filter={data.filter} searchError={data.searchError} />
      </div>

      <section id="checks-list-panel" class="panel m-2">
        <div class="panel-pad">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="panel-title text-lg font-black tracking-tight">監視対象</h2>
              <p class="mt-1 text-sm muted">直近の状態、HTTP、遅延、間隔、しきい値だけを表示します。</p>
            </div>
            <span class="count-badge">{data.totalChecks} 件</span>
          </div>
          <CreateForm page={data.page} q={data.q} filter={data.filter} />
          <div id="checks-list" class="mt-4 overflow-x-auto">
            {data.checks.length > 0 ? (
              <table class="checks-table">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col class="check-actions-col" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">監視対象</th>
                    <th scope="col">最終確認</th>
                    <th scope="col">HTTP / 遅延</th>
                    <th scope="col">間隔</th>
                    <th scope="col">しきい値</th>
                    <th scope="col">証明書</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.checks.map((check) =>
                    data.editId === check.id ? (
                      <EditCard check={check} page={data.page} q={data.q} filter={data.filter} />
                    ) : (
                      <ViewCard check={check} page={data.page} q={data.q} filter={data.filter} highlighted={data.highlightId === check.id} />
                    ),
                  )}
                </tbody>
              </table>
            ) : (
              <div id="checks-empty" class="empty-state border border-dashed border-white/15 px-4 py-8">
                <div>
                  <span class="empty-icon text-sky-200">
                    <svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M12 4v16"/></svg>
                  </span>
                  <p class="mt-4 font-bold text-slate-100">まだ監視対象がありません。</p>
                  <p class="mt-1 text-sm text-slate-400">右上の追加ボタンから登録できます。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <div class="px-2 pb-2">
        <Pagination page={data.page} totalPages={data.totalPages} totalChecks={data.totalChecks} q={data.q} filter={data.filter} />
      </div>
    </div>
  </section>
);

const ChecksDocument = ({ data }: { data: ChecksPageData }) => (
  <AppLayout
    title="Edge Pulse / 監視一覧"
    activeHref="/checks"
    footerStatus={data.checks.some((check) => check.enabled === 1 && check.last_state === "fail") ? "degraded" : "healthy"}
  >
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
