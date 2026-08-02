import { renderToString } from "hono/jsx/dom/server";
import { AppLayout } from "./app-layout.tsx";
import type { ChecksPageData as ChecksPageDataType } from "../store/checks";
import { buildCheckOrderWithTerm, buildChecksUrl, getCheckOrderDirection } from "../lib/checks-search";
import { CheckEditForm, HX_SWAP_NO_SCROLL } from "./check-edit-form";
import { LocalTime } from "./time.tsx";
import { formatNullable } from "../presenters/common";
import { formatDuration } from "../presenters/dashboard";
import { describeCertificateBadge, describeCheckState, describeMaintenanceBadge } from "../presenters/checks";
import type { CloudflareAccessIdentity } from "../http/shared";

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

const MaintenanceBadge = ({
  check,
}: {
  check: ChecksPageData["checks"][number];
}) => {
  const badge = describeMaintenanceBadge(check);
  if (!badge) return null;

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

const formatTimingMs = (value: number | null | undefined, fractionDigits = 3): string => {
  if (value === null || value === undefined) return "-";
  return `${Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits).replace(/\.?0+$/, "")}ms`;
};

const SearchPanel = ({ q, filter, order, groupId, groups, searchError }: { q: string; filter: string; order: string; groupId: number | null; groups: NonNullable<ChecksPageData["groups"]>; searchError: string | null }) => (
  <div class="summary-cell checks-search-cell min-w-0">
    <form
      id="checks-search-form"
      class="grid gap-3"
      action="/checks"
      method="get"
      hx-get="/checks"
      hx-trigger="submit, change from:#checks-status-filter, change from:#checks-group-filter"
      hx-target="#content"
      hx-swap={HX_SWAP_NO_SCROLL}
    >
      <p class="text-sm font-bold tracking-wide text-slate-200">検索</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          name="q"
          value={q}
          placeholder="name, url, state..."
          class="glass-input w-full rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400 sm:col-span-2"
        />
        <select id="checks-status-filter" name="filter" class="glass-input min-w-0 rounded-md px-3 py-2 text-slate-100">
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
        <select id="checks-group-filter" name="group" class="glass-input min-w-0 rounded-md px-3 py-2 text-slate-100">
          <option value="" selected={groupId === null}>すべての group</option>
          {groups.map((group) => <option value={group.id} selected={group.id === groupId}>{group.name} ({group.slug})</option>)}
        </select>
        <input type="hidden" name="order" value={order} />
      </div>
      {searchError ? (
        <p id="checks-search-error" class="rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {searchError}
        </p>
      ) : null}
    </form>
  </div>
);

type SortableHeaderKey = "name" | "checked_at" | "certificate_remain";

const SortHeader = ({
  label,
  orderKey,
  order,
  q,
  filter,
  groupId,
}: {
  label: string;
  orderKey: SortableHeaderKey;
  order: string;
  q: string;
  filter: string;
  groupId: number | null;
}) => {
  const currentDirection = getCheckOrderDirection(order, orderKey);
  const nextDirection = currentDirection === null ? "asc" : currentDirection === "asc" ? "desc" : null;
  const nextOrder = buildCheckOrderWithTerm(order, orderKey, nextDirection);
  const href = buildChecksUrl({ page: 1, q, filter, order: nextOrder, group: groupId });
  const icon =
    currentDirection === null ? (
      <svg viewBox="0 0 24 24" class="sort-toggle-icon" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M6 9h12" />
        <path d="M6 15h12" />
      </svg>
    ) : currentDirection === "asc" ? (
      <svg viewBox="0 0 24 24" class="sort-toggle-icon" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m6 15 6-6 6 6" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" class="sort-toggle-icon" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  const labelText = currentDirection === null ? "なし" : currentDirection;
  const ariaLabel =
    nextDirection === null
      ? `${label} のソートを解除`
      : `${label} を ${nextDirection === "asc" ? "昇順" : "降順"} で並び替え`;

  return (
    <th scope="col">
      <div class="sort-header">
        <a
          href={href}
          hx-get={href}
          hx-target="#content"
          hx-swap={HX_SWAP_NO_SCROLL}
          aria-label={ariaLabel}
          title={`${label}: ${labelText}`}
          class={`sort-toggle ${currentDirection === null ? "" : "active"}`}
        >
          <span class="sort-header-label">{label}</span>
          <span class="sort-toggle-icon-wrap">{icon}</span>
        </a>
      </div>
    </th>
  );
};

const CheckGroupBadge = ({ check, groups }: { check: ChecksPageData["checks"][number]; groups: NonNullable<ChecksPageData["groups"]> }) => {
  const currentGroup = groups.find((group) => group.id === check.group_id);
  return <span id={`check-item-${check.id}-group`} class="group-badge">{currentGroup ? `${currentGroup.name} (${currentGroup.slug})` : "割当待ち"}</span>;
};

const CheckGroupMoveControl = ({ check, groups, groupId, q, filter, order, isSuperadmin }: { check: ChecksPageData["checks"][number]; groups: NonNullable<ChecksPageData["groups"]>; groupId: number | null; q: string; filter: string; order: string; isSuperadmin: boolean }) => {
  if (!isSuperadmin) return null;

  const action = buildChecksUrl({ q, filter, order, group: groupId }).replace("/checks", `/checks/${check.id}/group`);
  return (
    <div class="grid w-full justify-items-end gap-2">
      <button id={`check-item-${check.id}-group-move-open`} class="glass-button inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100" type="button" data-dialog-id={`check-item-${check.id}-group-dialog`} aria-haspopup="dialog">移動</button>
      <dialog id={`check-item-${check.id}-group-dialog`} aria-labelledby={`check-item-${check.id}-group-dialog-title`} class="check-group-dialog glass-surface w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-white/15 p-6 text-slate-100 shadow-2xl backdrop:bg-slate-950/70">
        <form id={`check-item-${check.id}-group-form`} class="grid gap-4" method="post" action={action} hx-post={action} hx-target="#content" hx-swap={HX_SWAP_NO_SCROLL}>
          <div><h3 id={`check-item-${check.id}-group-dialog-title`} class="text-lg font-black">group を移動</h3><p class="mt-1 text-sm text-slate-300">{check.name}</p></div>
          <label class="grid gap-1 text-sm"><span class="font-semibold text-slate-200">移動先 group</span><select id={`check-item-${check.id}-group-select`} name="group_id" class="glass-input rounded-md px-2 py-2" required>{groups.map((group) => <option value={group.id} selected={group.id === check.group_id}>{group.name} ({group.slug})</option>)}</select></label>
          <div class="flex justify-end gap-2"><button id={`check-item-${check.id}-group-cancel`} class="glass-button rounded-md px-3 py-2 text-sm" type="button">キャンセル</button><button id={`check-item-${check.id}-group-save`} class="glass-button rounded-md px-3 py-2 text-sm font-bold" type="submit">保存</button></div>
        </form>
      </dialog>
    </div>
  );
};

const ViewCard = ({
  check,
  page,
  q,
  filter,
  order,
  groupId,
  groups,
  isSuperadmin,
  generatedAt,
  highlighted,
}: {
  check: ChecksPageData["checks"][number];
  page: number;
  q: string;
  filter: string;
  order: string;
  groupId: number | null;
  groups: NonNullable<ChecksPageData["groups"]>;
  isSuperadmin: boolean;
  generatedAt: string;
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
        <MaintenanceBadge check={check} />
      </div>
      <p class="check-url">{check.url}</p>
      <div class="mt-2 flex justify-end"><CheckGroupBadge check={check} groups={groups} /></div>
    </th>
    <td class="check-meta-cell">
      <div class="check-meta-value"><LocalTime iso={check.last_checked_at} class="whitespace-nowrap" /></div>
    </td>
    <td class="check-meta-cell">
      <div class="grid gap-3">
        <div>
          <p class="check-meta-label">HTTP</p>
          <div class="check-meta-value text-right tabular-nums">{formatNullable(check.last_status_code)}</div>
        </div>
        <div>
          <p class="check-meta-label">応答時間</p>
          <div class="check-meta-value text-right tabular-nums">
            <span class="text-[0.92em] text-slate-300/80">{formatTimingMs(check.last_runtime_ms, 2)}</span>
            <span>{` / ${formatTimingMs(check.last_latency_ms)}`}</span>
          </div>
        </div>
      </div>
    </td>
    <td class="check-meta-cell">
      <div class="grid gap-3">
        <div>
          <p class="check-meta-label">稼働開始日時</p>
          <div class="check-meta-value text-right">
            <LocalTime iso={check.last_state === "ok" ? check.uptime_started_at ?? null : null} class="whitespace-nowrap" seconds={false} />
          </div>
        </div>
        <div>
          <p class="check-meta-label">連続稼働時間</p>
          <div class="check-meta-value text-right tabular-nums">
            {check.last_state === "ok" && check.uptime_started_at ? formatDuration(check.uptime_started_at, generatedAt) : "-"}
          </div>
        </div>
      </div>
    </td>
    <td class="check-meta-cell">
      <div class="check-meta-value">
        <CertificateBadge check={check} />
      </div>
    </td>
    <td class="check-actions-cell">
      <CheckGroupMoveControl check={check} groups={groups ?? []} groupId={groupId} q={q} filter={filter} order={order} isSuperadmin={isSuperadmin} />
      <a
        id={`check-item-${check.id}-edit`}
        href={buildChecksUrl({ page, edit: check.id, focus: check.id, q, filter, order, group: groupId })}
        hx-get={buildChecksUrl({ page, edit: check.id, focus: check.id, q, filter, order, group: groupId })}
        hx-target="#content"
        hx-swap={HX_SWAP_NO_SCROLL}
        class="glass-button inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100"
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
  order,
  groupId,
}: {
  check: ChecksPageData["checks"][number];
  page: number;
  q: string;
  filter: string;
  order: string;
  groupId: number | null;
}) => (
  <tr id={`check-item-${check.id}`} class="check-row check-row-edit">
    <td colSpan={6} class="check-edit-cell">
      <CheckEditForm
        check={check}
        formId={`check-item-${check.id}-form`}
        submitId={`check-item-${check.id}-save`}
        cancelId={`check-item-${check.id}-cancel`}
        title="監視対象を編集"
        action={buildChecksUrl({ page, q, filter, order, group: groupId }).replace("/checks", `/checks/${check.id}`)}
        target="#content"
        cancelHref={buildChecksUrl({ page, focus: check.id, q, filter, order, group: groupId })}
      />
    </td>
  </tr>
);

const CreateForm = ({ page, q, filter, order, groupId }: { page: number; q: string; filter: string; order: string; groupId: number | null }) => (
  <div id="checks-create-form-wrap" hidden>
    <form
      id="checks-create-form"
      class="table-wrap mt-4 grid gap-3 p-4"
      hx-post={buildChecksUrl({ page, q, filter, order, group: groupId })}
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
          <div class="grid min-w-0 gap-1 text-sm">
            <span class="font-semibold text-slate-200">メンテ中</span>
            <label class="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
              <input name="maintenance_enabled" type="checkbox" class="h-4 w-4 accent-sky-400" />
              <span>通知を止める</span>
            </label>
          </div>
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
  pageSize,
  totalPages,
  totalChecks,
  q,
  filter,
  order,
  groupId,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  totalChecks: number;
  q: string;
  filter: string;
  order: string;
  groupId: number | null;
}) => {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const startIndex = totalChecks === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = totalChecks === 0 ? 0 : Math.min(totalChecks, startIndex + pageSize - 1);
  const buttonClass = "glass-button inline-flex items-center rounded-md px-4 py-3 text-sm font-semibold text-slate-100";

  return (
    <section id="checks-pagination-panel" class="panel panel-pad">
      <div class="pagination">
        <div>
          <p class="text-sm muted">
            {startIndex}-{endIndex} / {totalChecks} 件
          </p>
          <p class="mt-1 text-xs muted">
            ページ {page} / {totalPages}
          </p>
        </div>
        <div class="page-buttons">
          {hasPrev ? (
            <a
              id="checks-pagination-prev"
              href={buildChecksUrl({ page: prevPage, q, filter, order, group: groupId })}
              hx-get={buildChecksUrl({ page: prevPage, q, filter, order, group: groupId })}
              hx-target="#content"
              hx-swap={HX_SWAP_NO_SCROLL}
              class={buttonClass}
            >
              前へ
            </a>
          ) : (
            <span id="checks-pagination-prev" aria-disabled="true" class={`${buttonClass} opacity-55`}>
              前へ
            </span>
          )}
          <span id="checks-pagination-current" class={buttonClass}>
            {page} / {totalPages}
          </span>
          {hasNext ? (
            <a
              id="checks-pagination-next"
              href={buildChecksUrl({ page: nextPage, q, filter, order, group: groupId })}
              hx-get={buildChecksUrl({ page: nextPage, q, filter, order, group: groupId })}
              hx-target="#content"
              hx-swap={HX_SWAP_NO_SCROLL}
              class={buttonClass}
            >
              次へ
            </a>
          ) : (
            <span id="checks-pagination-next" aria-disabled="true" class={`${buttonClass} opacity-55`}>
              次へ
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

const ChecksShell = ({ data, isSuperadmin }: { data: ChecksPageData; isSuperadmin: boolean }) => (
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
            <dd><span class="text-emerald-300">{data.okChecks}</span> / {data.totalChecks}</dd>
          </div>
        </div>
        <div class="summary-cell">
          <div class="summary-metric">
            <dt>停止中</dt>
            <dd>{data.stoppedChecks}</dd>
          </div>
        </div>
        <SearchPanel q={data.q} filter={data.filter} order={data.order} groupId={data.groupId ?? null} groups={data.groups ?? []} searchError={data.searchError} />
      </div>

      <div class="px-2 pt-2">
        <section id="checks-list-panel" class="checks-list-panel">
          <div class="panel-pad">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 class="panel-title text-lg font-black tracking-tight">監視対象</h2>
                <p class="mt-1 text-sm muted">直近の状態、HTTP、応答時間、稼働、証明書だけを表示します。</p>
              </div>
              <span class="count-badge">{data.totalChecks} 件</span>
            </div>
            <CreateForm page={data.page} q={data.q} filter={data.filter} order={data.order} groupId={data.groupId ?? null} />
            <div id="checks-list" class="mt-4 overflow-x-auto">
              {data.checks.length > 0 ? (
                <table class="checks-table">
                  <colgroup>
                    <col class="check-main-col" />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col class="check-actions-col" />
                  </colgroup>
                  <thead>
                    <tr>
                      <SortHeader label="監視対象" orderKey="name" order={data.order} q={data.q} filter={data.filter} groupId={data.groupId ?? null} />
                      <SortHeader label="最終確認" orderKey="checked_at" order={data.order} q={data.q} filter={data.filter} groupId={data.groupId ?? null} />
                      <th scope="col">HTTP / 応答時間</th>
                      <th scope="col">稼働</th>
                      <SortHeader label="証明書" orderKey="certificate_remain" order={data.order} q={data.q} filter={data.filter} groupId={data.groupId ?? null} />
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checks.map((check) =>
                      data.editId === check.id ? (
                        <EditCard check={check} page={data.page} q={data.q} filter={data.filter} order={data.order} groupId={data.groupId ?? null} />
                      ) : (
                        <ViewCard
                          check={check}
                          page={data.page}
                          q={data.q}
                          filter={data.filter}
                          order={data.order}
                          groupId={data.groupId ?? null}
                          groups={data.groups ?? []}
                          isSuperadmin={isSuperadmin}
                          generatedAt={data.generatedAt}
                          highlighted={data.highlightId === check.id}
                        />
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
      </div>
      <div class="px-6 pb-2 mb-4">
        <Pagination page={data.page} pageSize={data.pageSize} totalPages={data.totalPages} totalChecks={data.totalChecks} q={data.q} filter={data.filter} order={data.order} groupId={data.groupId ?? null} />
      </div>
    </div>
  </section>
);

const ChecksDocument = ({ data, isSuperadmin, accessIdentity }: { data: ChecksPageData; isSuperadmin: boolean; accessIdentity: CloudflareAccessIdentity | null }) => (
  <AppLayout
    title="Edge Pulse / 監視一覧"
    activeHref="/checks"
    footerStatus={data.checks.some((check) => check.enabled === 1 && check.last_state === "fail") ? "degraded" : "healthy"}
    accessIdentity={accessIdentity}
    isSuperadmin={isSuperadmin}
  >
    <ChecksShell data={data} isSuperadmin={isSuperadmin} />
  </AppLayout>
);

export const renderChecksShell = (data: ChecksPageData, isSuperadmin = false): string => renderToString(<ChecksShell data={data} isSuperadmin={isSuperadmin} />);

export const renderChecksPage = (data: ChecksPageData, isSuperadmin = false, accessIdentity: CloudflareAccessIdentity | null = null): Response =>
  new Response(renderToString(<ChecksDocument data={data} isSuperadmin={isSuperadmin} accessIdentity={accessIdentity} />), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
