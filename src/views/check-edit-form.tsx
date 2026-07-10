import type { CheckRow } from "../lib/checks";

export const HX_SWAP_NO_SCROLL = "outerHTML show:none";

export const CheckEditForm = ({
  check,
  formId,
  submitId,
  cancelId,
  title,
  action,
  target,
  cancelHref,
}: {
  check: CheckRow;
  formId: string;
  submitId: string;
  cancelId: string;
  title: string;
  action: string;
  target: string;
  cancelHref: string;
}) => (
  <form
    id={formId}
    class="check-edit-form"
    hx-post={action}
    hx-target={target}
    hx-swap={HX_SWAP_NO_SCROLL}
  >
    <div class="check-edit-card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="check-name">{title}</h3>
          <p class="check-url">{check.url}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button id={submitId} class="glass-button inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-100">
            保存
          </button>
          <a
            id={cancelId}
            href={cancelHref}
            hx-get={cancelHref}
            hx-target={target}
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
          <div class="check-edit-field">
            <span class="check-meta-label">メンテ中</span>
            <label class="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
              <input name="maintenance_enabled" type="checkbox" checked={check.maintenance_enabled === 1} class="h-4 w-4 accent-sky-400" />
              <span>通知を止める</span>
            </label>
          </div>
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
);
