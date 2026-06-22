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
      created_at: "2026-06-21T12:00:00.000Z",
      updated_at: "2026-06-22T00:05:00.000Z",
    },
  ],
  page: 2,
  pageSize: 20,
  totalChecks: 42,
  totalPages: 3,
  editId: 2,
  generatedAt: "2026-06-22T00:00:00.000Z",
};

describe("renderChecksPage", () => {
  it("renders the management page with edit mode and pagination", async () => {
    const response = await renderChecksPage(checksPageData);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");

    const html = await response.text();
    expect(html).toContain("監視一覧と編集");
    expect(html).toContain('href="#content" class="skip-link"');
    expect(html).toContain('id="content"');
    expect(html).toContain("#content {");
    expect(html).toContain("width: min(100%, 80rem);");
    expect(html).toContain(":focus-visible");
    expect(html).toContain('id="checks-shell" class="w-full"');
    expect(html).toContain('id="checks-create-toggle"');
    expect(html).toContain('id="checks-create-form"');
    expect(html).toContain('id="checks-create-form-wrap" hidden');
    expect(html).toContain('id="checks-list-panel"');
    expect(html).toContain('id="checks-list"');
    expect(html).toContain('id="check-item-1"');
    expect(html).toContain('id="check-item-1-edit"');
    expect(html).toContain('id="check-item-2"');
    expect(html).toContain('id="check-item-2-save"');
    expect(html).toContain('id="check-item-2-cancel"');
    expect(html).toContain('id="checks-pagination-panel"');
    expect(html).toContain('id="checks-pagination-current"');
    expect(html).toContain('id="checks-pagination-prev"');
    expect(html).toContain('id="checks-pagination-next"');
    expect(html).toContain('2 / 3');
    expect(html).toContain('hx-post="/checks/2?page=2"');
    expect(html).toContain('hx-target="#content"');
    expect(html).toContain('hx-swap="outerHTML show:top"');
    expect(html).toContain('hx-get="/checks?page=2&edit=1"');
  });
});
