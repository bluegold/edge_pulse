import { describe, expect, it } from "vitest";
import { renderChecksPage, type ChecksPageData } from "../src/views/checks-page.tsx";

const checksPageData: ChecksPageData = {
  checks: [
    {
      id: 1,
      name: "api-a",
      url: "https://api-a.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 10_000,
      interval_minutes: 5,
      next_check_at: null,
      last_enqueued_at: null,
      last_checked_at: "2026-06-22T00:00:00.000Z",
      last_state: "ok",
      last_status_code: 200,
      last_latency_ms: 80,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      maintenance_enabled: 0,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
    {
      id: 2,
      name: "api-b",
      url: "https://api-b.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 12_000,
      interval_minutes: 10,
      next_check_at: null,
      last_enqueued_at: null,
      last_checked_at: "2026-06-22T00:05:00.000Z",
      last_state: "fail",
      last_status_code: 500,
      last_latency_ms: null,
      last_error: "HTTP 500",
      fail_threshold: 3,
      recovery_threshold: 1,
      consecutive_failures: 2,
      consecutive_successes: 0,
      first_failure_at: "2026-06-22T00:03:00.000Z",
      first_success_at: null,
      maintenance_enabled: 0,
      created_at: "2026-06-21T12:00:00.000Z",
      updated_at: "2026-06-22T00:05:00.000Z",
    },
  ],
  page: 2,
  pageSize: 20,
  totalChecks: 42,
  okChecks: 1,
  stoppedChecks: 0,
  totalPages: 3,
  editId: 2,
  highlightId: 1,
  q: "",
  filter: "",
  order: "",
  searchError: null,
  generatedAt: "2026-06-22T00:00:00.000Z",
};

describe("renderChecksPage", () => {
  it("renders the management page with edit mode and pagination", async () => {
    const response = await renderChecksPage(checksPageData);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");

    const html = await response.text();
    expect(html).toContain("監視一覧と編集");
    expect(html).toContain('rel="icon" href="/assets/favicon.svg" type="image/svg+xml"');
    expect(html).toContain('href="#content" class="skip-link"');
    expect(html).toContain('id="content"');
    expect(html).toContain("#content {");
    expect(html).toContain("width: min(100%, 92rem);");
    expect(html).toContain(":focus-visible");
    expect(html).toContain('id="checks-shell" class="w-full"');
    expect(html).toContain('data-focus-check-id="2"');
    expect(html).toContain('id="checks-create-toggle"');
    expect(html).toContain('id="checks-search-form"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="filter"');
    expect(html).toContain('name="order"');
    expect(html).toContain('type="hidden" name="order" value=""');
    expect(html).toContain('checks-search-cell');
    expect(html).toContain('>稼働中<');
    expect(html).toContain('>障害中<');
    expect(html).toContain('>証明書30日以内<');
    expect(html).toContain('>24h障害件数<');
    expect(html).not.toContain('checked_at,certificate_remain,-name');
    expect(html).toContain('aria-label="監視対象 を 昇順 で並び替え"');
    expect(html).toContain('aria-label="最終確認 を 昇順 で並び替え"');
    expect(html).toContain('aria-label="証明書 を 昇順 で並び替え"');
    expect(html).toContain('title="監視対象: なし"');
    expect(html).toContain('title="最終確認: なし"');
    expect(html).toContain('title="証明書: なし"');
    expect(html).toContain('sort-toggle-icon');
    expect(html).not.toContain('id="checks-search-submit"');
    expect(html).not.toContain('id="checks-search-reset"');
    expect(html).toContain('id="checks-create-form"');
    expect(html).toContain('id="checks-create-form-wrap" hidden');
    expect(html).toContain('<script id="checks-page-controls" src="/assets/checks-page.js" defer=""></script>');
    expect(html).toContain('id="checks-list-panel"');
    expect(html).toContain('id="checks-list"');
    expect(html).toContain('data-utc-time="2026-06-22T00:00:00.000Z"');
    expect(html).toContain("<time");
    expect(html).toContain('id="check-item-1"');
    expect(html).toContain('href="/checks/1"');
    expect(html).toContain('id="check-item-1-edit"');
    expect(html).toContain('id="check-item-2"');
    expect(html).toContain('id="check-item-2-save"');
    expect(html).toContain('id="check-item-2-cancel"');
    expect(html).toContain('check-row-highlight');
    expect(html).toContain('証明書');
    expect(html).toContain('id="checks-pagination-panel"');
    expect(html).toContain('id="checks-pagination-current"');
    expect(html).toContain('id="checks-pagination-prev"');
    expect(html).toContain('id="checks-pagination-next"');
    expect(html).toContain('2 / 3');
    expect(html).toContain('hx-post="/checks/2?page=2"');
    expect(html).toContain('hx-post="/checks/2?page=2"');
    expect(html).toContain('hx-target="#content"');
    expect(html).toContain('hx-swap="outerHTML show:none"');
    expect(html).toContain('hx-get="/checks?page=2&amp;edit=1&amp;focus=1"');
    expect(html).toContain('href="/checks?page=1"');
    expect(html).toContain("一部のシステムで障害を検知しています");
    expect(html).toContain("status-fail");
  });
});
