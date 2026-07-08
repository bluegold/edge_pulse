import { describe, expect, it, vi } from "vitest";

const certificateResponse = {
  host: "api-a.example.com",
  port: 443,
  servername: "api-a.example.com",
  subject: "CN=api-a.example.com",
  issuer: "CN=Example CA",
  class: "RSA",
  valid_from: "2026-06-01T00:00:00.000Z",
  valid_to: "2026-09-01T00:00:00.000Z",
  days_remaining: 60,
  dns_names: ["api-a.example.com"],
  error: null,
};

vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: () => ({
    fetch: async () =>
      new Response(JSON.stringify(certificateResponse), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
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
  maintenance_enabled: 0,
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

const makeRecentResults = (): CheckDetailData["recentResults"] =>
  Array.from({ length: 13 }, (_, index) => {
    const id = 13 - index;
    const checkedAt = new Date(Date.parse(now) - index * 5 * 60_000).toISOString();

    return {
      id,
      ...baseResult,
      checked_at: checkedAt,
      status_code: id === 13 ? 500 : 200,
      latency_ms: id === 13 ? 240 : 80 + index,
      state: id === 13 ? "fail" : "ok",
      error: id === 13 ? "HTTP 500" : null,
      x_runtime_ms: id === 13 ? 7 : 12,
      server_timing_json: null,
    };
  });

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
  recentResults: makeRecentResults(),
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
  latestRecoveryAt: null,
  generatedAt: now,
};

const createDb = (result: CheckDetailData | null): D1Database => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();
    const statement = (params: unknown[] = []) => ({
      bind(...nextParams: unknown[]) {
        return statement(nextParams);
      },
      async first<T>() {
        if (normalized === "SELECT * FROM checks WHERE id = ? LIMIT 1" || normalized.includes("FROM checks c WHERE c.id = ?")) {
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
        if (normalized.includes("FROM checks c") || normalized.includes("FROM checks ORDER BY")) {
          return { results: result ? [result.check] : [] } as T;
        }
        return { results: [] } as T;
      },
      async run() {
        if (
          normalized.startsWith("UPDATE checks SET tls_last_checked_at = ?, tls_last_error = ?, tls_subject = COALESCE(?, tls_subject), tls_issuer = COALESCE(?, tls_issuer), tls_public_key_class = COALESCE(?, tls_public_key_class), tls_valid_from = COALESCE(?, tls_valid_from), tls_valid_to = COALESCE(?, tls_valid_to), tls_days_remaining = COALESCE(?, tls_days_remaining), tls_dns_names = COALESCE(?, tls_dns_names), updated_at = ? WHERE id = ?")
        ) {
          const [
            tlsLastCheckedAt,
            tlsLastError,
            tlsSubject,
            tlsIssuer,
            tlsPublicKeyClass,
            tlsValidFrom,
            tlsValidTo,
            tlsDaysRemaining,
            tlsDnsNames,
            updatedAt,
            id,
          ] = params as [
            string,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            number | null,
            string | null,
            string,
            number,
          ];

          if (result && result.check.id === id) {
            result.check = {
              ...result.check,
              tls_last_checked_at: tlsLastCheckedAt,
              tls_last_error: tlsLastError,
              tls_subject: tlsSubject ?? result.check.tls_subject ?? null,
              tls_issuer: tlsIssuer ?? result.check.tls_issuer ?? null,
              tls_public_key_class: tlsPublicKeyClass ?? result.check.tls_public_key_class ?? null,
              tls_valid_from: tlsValidFrom ?? result.check.tls_valid_from ?? null,
              tls_valid_to: tlsValidTo ?? result.check.tls_valid_to ?? null,
              tls_days_remaining: tlsDaysRemaining ?? result.check.tls_days_remaining ?? null,
              tls_dns_names: tlsDnsNames ?? result.check.tls_dns_names ?? null,
              updated_at: updatedAt,
            };
          }
        }

        return { success: true };
      },
    });

    return statement();
  },
  batch: async <T>() => [] as T[],
});

describe("check detail", () => {
  it("renders the stacked detail page", async () => {
    const response = await renderCheckDetailPage(detailData);
    const html = await response.text();

    expect(html).toContain("24h 障害");
    expect(html).toContain("過去24H");
    expect(html).toContain("証明書情報");
    expect(html).toContain("証明書の最終確認日時・結果");
    expect(html).toContain("次回証明書確認");
    expect(html).toContain("2026-07-10T11:40:00.000Z");
    expect(html).toContain("状態遷移イベント");
    expect(html).toContain("incident 履歴");
    expect(html).toContain("直近のチェック結果");
    expect(html).toContain("有効");
    expect(html).toContain("最終更新");
    expect(html).toContain('id="check-result-13"');
    expect(html).not.toContain('id="check-result-1"');
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
    expect(data?.recentResults).toHaveLength(13);
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
        CertProbeContainer: {} as never,
      } as never,
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="check-detail-shell"');
    expect(html).toContain("Edge Pulse / api-a");
  });

  it("rechecks certificate data from the dashboard route", async () => {
    const state = {
      ...detailData,
      check: {
        ...detailData.check,
        tls_last_checked_at: "2026-07-03T11:40:00.000Z",
        tls_last_error: "stale",
        tls_subject: null,
        tls_issuer: null,
        tls_public_key_class: null,
        tls_valid_from: null,
        tls_valid_to: null,
        tls_days_remaining: null,
        tls_dns_names: null,
      },
    };

    const response = await app.request(
      "http://localhost/checks/1/certificate/recheck",
      {
        method: "POST",
        headers: {
          "HX-Request": "true",
          origin: "https://evil.example.com",
        },
      },
      {
        "pulse-db": createDb(state),
        CertProbeContainer: {} as never,
      } as never,
    );

    expect(response.status).toBe(403);
  });

});
