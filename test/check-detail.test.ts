import { describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: () => ({
    fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  }),
}));

import { app } from "../src/index.ts";
import { loadCheckDetailData, type CheckDetailData } from "../src/store/check-detail";
import { renderCheckDetailPage } from "../src/views/check-detail-page.tsx";
import type { D1Database } from "../src/lib/cloudflare";
import type { CheckRow } from "../src/lib/checks";

const now = "2026-07-03T12:00:00.000Z";

const check: CheckRow = {
  id: 1,
  name: "api-a",
  url: "https://api-a.example.com",
  method: "GET",
  enabled: 1,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: "2026-07-03T12:05:00.000Z",
  last_enqueued_at: "2026-07-03T11:55:00.000Z",
  last_checked_at: now,
  last_state: "fail",
  last_status_code: 500,
  last_latency_ms: 240,
  last_error: "HTTP 500",
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 2,
  consecutive_successes: 0,
  first_failure_at: "2026-07-03T11:50:00.000Z",
  first_success_at: null,
  tls_last_checked_at: "2026-07-03T11:40:00.000Z",
  tls_last_error: null,
  tls_subject: "CN=api-a.example.com",
  tls_issuer: "CN=Example CA",
  tls_public_key_class: "RSA",
  tls_valid_from: "2026-06-01T00:00:00.000Z",
  tls_valid_to: "2026-09-01T00:00:00.000Z",
  tls_days_remaining: 60,
  tls_dns_names: '["api-a.example.com"]',
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-07-03T11:55:00.000Z",
};

const baseResult = {
  check_id: 1,
  check_name: "api-a",
  state: "ok" as const,
  status_code: 200,
  latency_ms: 80,
  error: null,
  checked_at: now,
};

const detailData: CheckDetailData = {
  check,
  report: {
    checks24h: 12,
    failures24h: 3,
    incidents24h: 1,
    availability24h: 75,
    avgLatencyMs: 110.25,
    avgRuntimeMs: 21.5,
  },
  recentResults: [
    {
      id: 3,
      ...baseResult,
      checked_at: "2026-07-03T12:00:00.000Z",
      status_code: 500,
      latency_ms: 240,
      state: "fail",
      error: "HTTP 500",
      x_runtime_ms: 7,
      server_timing_json: '[{"name":"total","durationMs":17.167},{"name":"db","durationMs":0.5440000677481294},{"name":"view","durationMs":15.272999997250736}]',
    },
    {
      id: 2,
      ...baseResult,
      checked_at: "2026-07-03T11:55:00.000Z",
      x_runtime_ms: 12,
      server_timing_json: null,
    },
  ],
  recentEvents: [
    {
      id: 1,
      check_id: 1,
      check_name: "api-a",
      from_state: "ok",
      to_state: "fail",
      reason: "HTTP 500",
      status_code: 500,
      error: "HTTP 500",
      latency_ms: 240,
      occurred_at: "2026-07-03T11:50:00.000Z",
    },
  ],
  recentIncidents: [
    {
      id: 1,
      check_id: 1,
      check_name: "api-a",
      check_url: "https://api-a.example.com",
      started_at: "2026-07-03T11:50:00.000Z",
      resolved_at: null,
      start_reason: "HTTP 500",
      end_reason: null,
      start_status_code: 500,
      end_status_code: null,
      failure_count: 2,
      created_at: "2026-07-03T11:50:00.000Z",
      updated_at: "2026-07-03T11:55:00.000Z",
    },
  ],
  generatedAt: now,
};

const createDb = (result: CheckDetailData | null): D1Database => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();
    return {
      bind(..._args: unknown[]) {
        return this;
      },
      async first<T>() {
        if (normalized === "SELECT * FROM checks WHERE id = ? LIMIT 1") {
          return (result?.check ?? null) as T;
        }
        if (normalized.includes("COUNT(*) AS checks24h")) {
          return (result ? result.report : null) as T;
        }
        if (normalized.includes("COUNT(*) AS incidents24h")) {
          return { incidents24h: result?.report.incidents24h ?? 0 } as T;
        }
        return null as T;
      },
      async all<T>() {
        if (normalized.includes("FROM check_results")) {
          return { results: result?.recentResults ?? [] } as T;
        }
        if (normalized.includes("FROM status_events")) {
          return { results: result?.recentEvents ?? [] } as T;
        }
        if (normalized.includes("FROM incidents")) {
          return { results: result?.recentIncidents ?? [] } as T;
        }
        return { results: [] } as T;
      },
      async run() {
        return {};
      },
    };
  },
});

describe("check detail", () => {
  it("renders the stacked detail page", async () => {
    const response = await renderCheckDetailPage(detailData);
    const html = await response.text();

    expect(html).toContain("24h 障害");
    expect(html).toContain("過去24H");
    expect(html).toContain("赤い点が障害時刻です。");
    expect(html).toContain("証明書情報");
    expect(html).toContain("状態遷移イベント");
    expect(html).toContain("incident 履歴");
    expect(html).toContain("直近のチェック結果");
    expect(html).toContain("有効");
    expect(html).toContain("最終更新");
    expect(html).not.toContain("24h incident");
    expect(html).toContain('<script type="module" src="/assets/check-detail-graphs.js" defer=""></script>');
    expect(html).toContain('href="/checks"');
    expect(html).toContain("X-Runtime の推移");
    expect(html).toContain("Server-Timing");
  });

  it("loads detail data through the store", async () => {
    const data = await loadCheckDetailData(createDb(detailData), 1);

    expect(data?.report.checks24h).toBe(12);
    expect(data?.report.failures24h).toBe(3);
    expect(data?.report.availability24h).toBe(75);
    expect(data?.report.avgLatencyMs).toBe(110.25);
    expect(data?.report.avgRuntimeMs).toBe(21.5);
    expect(data?.recentResults).toHaveLength(2);
    expect(data?.recentEvents).toHaveLength(1);
    expect(data?.recentIncidents).toHaveLength(1);
  });

  it("serves the detail route", async () => {
    const response = await app.request(
      "http://localhost/checks/1",
      {
        method: "GET",
      },
      {
        "pulse-db": createDb(detailData),
      } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="check-detail-shell"');
    expect(html).toContain("Edge Pulse / api-a");
  });
});
