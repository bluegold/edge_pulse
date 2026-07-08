import { describe, expect, it } from "vitest";
import { renderDashboardPage, type DashboardData } from "../src/views/dashboard-page.tsx";
import type { CloudflareAccessIdentity } from "../src/http/shared";

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
      id: 2,
      name: "api-fail",
      url: "https://api-fail.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 10_000,
      interval_minutes: 5,
      next_check_at: null,
      last_enqueued_at: null,
      last_checked_at: "2026-06-21T23:55:00.000Z",
      last_state: "fail",
      last_status_code: 500,
      last_latency_ms: 456,
      last_error: "HTTP 500",
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 2,
      consecutive_successes: 0,
      first_failure_at: "2026-06-21T23:50:00.000Z",
      first_success_at: null,
      created_at: "2026-06-21T23:00:00.000Z",
      updated_at: "2026-06-21T23:55:00.000Z",
    },
    {
      id: 4,
      name: "maintenance",
      url: "https://maintenance.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 10_000,
      interval_minutes: 15,
      next_check_at: null,
      last_enqueued_at: null,
      last_checked_at: "2026-06-21T23:40:00.000Z",
      last_state: "ok",
      last_status_code: 200,
      last_latency_ms: 210,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      maintenance_enabled: 1,
      created_at: "2026-06-21T23:20:00.000Z",
      updated_at: "2026-06-21T23:40:00.000Z",
    },
    {
      id: 3,
      name: "cert-warning",
      url: "https://cert-warning.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 10_000,
      interval_minutes: 10,
      next_check_at: null,
      last_enqueued_at: null,
      last_checked_at: "2026-06-21T23:45:00.000Z",
      last_state: "ok",
      last_status_code: 200,
      last_latency_ms: 321,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      tls_last_checked_at: "2026-06-21T23:45:00.000Z",
      tls_last_error: null,
      tls_subject: "CN=cert-warning.example.com",
      tls_issuer: "CN=Example CA",
      tls_public_key_class: "rsa",
      tls_valid_from: "2026-03-01T00:00:00.000Z",
      tls_valid_to: "2026-07-10T00:00:00.000Z",
      tls_days_remaining: 5,
      tls_dns_names: "cert-warning.example.com",
      maintenance_enabled: 0,
      created_at: "2026-06-21T23:30:00.000Z",
      updated_at: "2026-06-21T23:45:00.000Z",
    },
    {
      id: 5,
      name: "cert-error",
      url: "https://cert-error.example.com",
      method: "GET",
      enabled: 1,
      expected_status_min: 200,
      expected_status_max: 399,
      timeout_ms: 10_000,
      interval_minutes: 10,
      next_check_at: "2026-06-22T00:15:00.000Z",
      last_enqueued_at: null,
      last_checked_at: "2026-06-21T23:50:00.000Z",
      last_state: "ok",
      last_status_code: 200,
      last_latency_ms: 111,
      last_error: null,
      fail_threshold: 2,
      recovery_threshold: 1,
      consecutive_failures: 0,
      consecutive_successes: 0,
      first_failure_at: null,
      first_success_at: null,
      tls_last_checked_at: "2026-06-21T23:50:00.000Z",
      tls_last_error: "certificate expired 1 day ago",
      tls_subject: null,
      tls_issuer: null,
      tls_public_key_class: null,
      tls_valid_from: null,
      tls_valid_to: null,
      tls_days_remaining: null,
      tls_dns_names: null,
      maintenance_enabled: 0,
      created_at: "2026-06-21T23:40:00.000Z",
      updated_at: "2026-06-21T23:50:00.000Z",
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
    {
      id: 2,
      check_id: 1,
      check_name: "api<&>'",
      state: "fail",
      status_code: 500,
      latency_ms: null,
      error: "HTTP 500",
      checked_at: "2026-06-22T00:01:00.000Z",
    },
  ],
  recentEvents: [
    {
      id: 1,
      check_id: 1,
      check_name: "api<&>'",
      from_state: "fail",
      to_state: "ok",
      reason: "http_ok",
      status_code: 200,
      error: null,
      latency_ms: 123,
      occurred_at: "2026-06-22T00:02:00.000Z",
    },
  ],
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
    expect(html).toContain('rel="icon" href="/assets/favicon.svg" type="image/svg+xml"');
    expect(html).toContain("api&lt;&amp;&gt;&#39;");
    expect(html).toContain('href="#content" class="skip-link"');
    expect(html).toContain("sticky top-0 z-50 w-full");
    expect(html).toContain("flex min-h-screen flex-col");
    expect(html).toContain('id="content"');
    expect(html).toContain("#content {");
    expect(html).toContain("width: min(100%, 92rem);");
    expect(html).toContain(":focus-visible");
    expect(html).toContain('id="dashboard-shell" class="w-full"');
    expect(html).toContain('id="dashboard-auto-reload-toggle"');
    expect(html).toContain('id="dashboard-auto-reload-idle"');
    expect(html).toContain('id="dashboard-auto-reload-active"');
    expect(html).toContain('id="dashboard-auto-reload-ring"');
    expect(html).toContain('data-role="center"');
    expect(html).toContain('<script src="/assets/auto-reload.js" defer=""></script>');
    expect(html).toContain('<script id="checks-page-controls" src="/assets/checks-page.js" defer=""></script>');
    expect(html).toContain("<footer");
    expect(html).toContain('class="footerbar mt-auto w-full"');
    expect(html).toContain("すべてのシステムは正常です");
    expect(html).toContain('id="summary-total-checks"');
    expect(html).toContain('href="/checks"');
    expect(html).toContain('href="/checks?filter=%28%26%28enabled%3D1%29%28last_state%3Dok%29%29"');
    expect(html).toContain('href="/checks?filter=%28%26%28enabled%3D1%29%28last_state%3Dfail%29%29"');
    expect(html).toContain('href="/checks?filter=%28%26%28enabled%3D1%29%28cert_expiring_soon%3D1%29%29"');
    expect(html).toContain('href="/checks?filter=%28recent_incident_24h%3D1%29"');
    expect(html).toContain('id="summary-cert-expiring"');
    expect(html).toContain('id="current-incidents-panel"');
    expect(html).toContain('id="current-incidents-list"');
    expect(html).toContain("×");
    expect(html).toContain('data-utc-time="2026-06-22T00:00:00.000Z"');
    expect(html).toContain("<time");
    expect(html).toContain('id="recent-checks-panel"');
    expect(html).toContain('id="recent-checks-list"');
    expect(html).toContain('class="recent-check-card relative overflow-hidden p-4"');
    expect(html).toContain('.recent-check-card {');
    expect(html).toContain('hx-target="#recent-check-3"');
    expect(html).toContain('hx-target="#recent-check-5"');
    expect(html).not.toContain('hx-target="#recent-check-2"');
    expect(html).toContain("監視最終確認");
    expect(html).toContain('status off status-fail');
    expect(html).toContain("メンテ中");
    expect(html).toContain("証明書要確認");
    expect(html).toContain("証明書確認失敗");
    expect(html).toContain("再確認");
    expect(html).toContain('hx-target="#recent-check-5"');
    expect(html).not.toContain('hx-target="closest article"');
    expect(html).toContain('hx-swap="outerHTML show:none"');
    expect(html).toContain('hx-indicator="#cert-recheck-indicator-5"');
    expect(html).toContain('id="cert-recheck-indicator-5"');
    expect(html).toContain("証明書を再確認中");
    expect(html).toContain("証明書残日数");
    expect(html).toContain("証明書の最終確認");
    expect(html).toContain("次回確認予定日時");
    expect(html).not.toContain("証明書だけを再取得します。");
    expect(html).toContain('id="recent-results-panel"');
    expect(html).toContain('id="recent-results-list"');
    expect(html).toContain('class="result-mark fail"');
    expect(html).toContain("×");
    expect(html).toContain('id="status-events-panel"');
    expect(html).toContain('id="status-events-list"');
    expect(html).toContain("×");
    expect(html).toContain("→");
    expect(html).toContain("✓");
    expect(html).toContain('id="incident-history-panel"');
    expect(html).toContain('id="incident-history-list"');
    expect((html.match(/href="\/checks\/1"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('id="checks-create-form"');
  });

  it("hides the recent checks panel when there are no issue checks", async () => {
    const response = await renderDashboardPage({
      ...dashboardData,
      recentChecks: [],
    });

    const html = await response.text();

    expect(html).not.toContain('id="recent-checks-panel"');
    expect(html).not.toContain('id="recent-checks-list"');
  });

  it("renders access identity in the topbar when provided", async () => {
    const accessIdentity: CloudflareAccessIdentity = {
      displayName: "Kaneko",
      email: "kaneko@example.com",
      audience: "edge-pulse-dashboard",
      subject: "user-123",
    };

    const response = await renderDashboardPage(dashboardData, accessIdentity);
    const html = await response.text();

    expect(html).toContain('id="topbar-theme-button"');
    expect(html).toContain("USER");
    expect(html).toContain("kaneko@example.com");
  });

  it("renders the active incident count when incidents are present", async () => {
    const response = await renderDashboardPage({
      ...dashboardData,
      currentIncidents: [
        {
          id: 10,
          check_id: 1,
          check_name: 'api<&>"\'',
          check_url: "https://api.example.com",
          started_at: "2026-06-22T00:00:00.000Z",
          resolved_at: null,
          start_reason: "http_status",
          end_reason: null,
          start_status_code: 500,
          end_status_code: null,
          failure_count: 2,
          created_at: "2026-06-22T00:00:00.000Z",
          updated_at: "2026-06-22T00:00:00.000Z",
        },
      ],
    });

    const html = await response.text();
    const panelMatch = html.match(/<section id="current-incidents-panel"[\s\S]*?<\/section>/);
    expect(panelMatch).not.toBeNull();
    const panelHtml = panelMatch?.[0] ?? "";
    expect(html).toContain("現在アクティブな incident が 1 件あります。");
    expect(html).not.toContain("現在アクティブな incident はありません。");
    expect(html).toContain("一部のシステムで障害を検知しています");
    expect(html).toContain("api&lt;&amp;&gt;&#39;");
    expect(html).toContain("障害中");
    expect(html).toContain('status off status-fail');
    expect((html.match(/href="\/checks\/1"/g) ?? []).length).toBe(4);
    expect(panelHtml).toContain("M12 17h.01");
    expect(panelHtml).not.toContain("m20 6-11 11-5-5");
    expect(panelHtml).toContain('status off status-fail');
  });
});
