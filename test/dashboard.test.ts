import { describe, expect, it } from "vitest";
import { renderDashboardPage, type DashboardData } from "../src/views/dashboard-page.tsx";

const dashboardData: DashboardData = {
  checks: [
    {
      id: 1,
      name: 'api<&>"\'',
      url: "https://api.example.com",
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
      last_latency_ms: 123,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      created_at: "2026-06-22T00:00:00.000Z",
      updated_at: "2026-06-22T00:00:00.000Z",
    },
  ],
  recentChecks: [
    {
      id: 1,
      name: 'api<&>"\'',
      url: "https://api.example.com",
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
      last_latency_ms: 123,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      created_at: "2026-06-22T00:00:00.000Z",
      updated_at: "2026-06-22T00:00:00.000Z",
    },
  ],
  currentIncidents: [],
  recentIncidents: [],
  recentResults: [
    {
      id: 1,
      check_id: 1,
      check_name: "api<&>'",
      state: "ok",
      status_code: 200,
      latency_ms: 123,
      error: null,
      checked_at: "2026-06-22T00:00:00.000Z",
    },
  ],
  recentEvents: [],
  incidents24h: 0,
  generatedAt: "2026-06-22T00:00:00.000Z",
};

describe("renderDashboardPage", () => {
  it("renders a dark dashboard with full-width sticky header and footer", async () => {
    const response = await renderDashboardPage(dashboardData);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");

    const html = await response.text();
    expect(html).toContain("Edge Pulse");
    expect(html).toContain("api&lt;&amp;&gt;&quot;&#039;");
    expect(html).toContain("sticky top-0 z-50 w-full");
    expect(html).toContain("flex min-h-screen flex-col");
    expect(html).toContain('id="content"');
    expect(html).toContain("#content {");
    expect(html).toContain("width: min(100%, 80rem);");
    expect(html).toContain('id="dashboard-shell" class="w-full"');
    expect(html).toContain("<footer");
    expect(html).toContain('class="mt-auto w-full border-t border-slate-800 bg-slate-950/85"');
    expect(html).toContain("bg-slate-950/85");
    expect(html).toContain("items-center justify-center text-center");
    expect(html).toContain('id="summary-total-checks"');
    expect(html).toContain('id="current-incidents-panel"');
    expect(html).toContain('id="current-incidents-list"');
    expect(html).toContain('id="recent-checks-panel"');
    expect(html).toContain('id="recent-checks-list"');
    expect(html).toContain('id="recent-check-1"');
    expect(html).toContain('id="recent-results-panel"');
    expect(html).toContain('id="recent-results-list"');
    expect(html).toContain('id="status-events-panel"');
    expect(html).toContain('id="status-events-list"');
    expect(html).toContain('id="incident-history-panel"');
    expect(html).toContain('id="incident-history-list"');
    expect(html).not.toContain('id="checks-create-form"');
  });
});
