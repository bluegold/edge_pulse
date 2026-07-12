import { describe, expect, it } from "vitest";
import { buildPublicStatusData, loadDashboardData, summarizeDashboard } from "../../src/store/dashboard";

const d1Meta: D1Meta & Record<string, unknown> = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
};

const emptyResult = <T>(): D1Result<T> => ({ success: true as const, meta: d1Meta, results: [] });

const makeDb = (): D1Database => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();
    return {
      bind(...args: unknown[]) {
        return this;
      },
      async first<T>() {
        if (normalized === "SELECT COUNT(*) AS count FROM incidents WHERE started_at >= ?") {
          return { count: 2 } as T;
        }
        return null as T;
      },
      async all<T>() {
        if (normalized.includes("FROM checks c") && normalized.includes("ORDER BY c.created_at DESC, c.id DESC")) {
          return {
            results: [
              { id: 1, name: "api", last_state: "ok", enabled: 1, last_latency_ms: 10, tls_valid_to: "2026-07-20T00:00:00.000Z", maintenance_enabled: 0 },
              { id: 2, name: "api-2", last_state: "fail", enabled: 1, last_latency_ms: null, tls_valid_to: null },
              { id: 3, name: "api-3", last_state: "ok", enabled: 1, last_latency_ms: 8, tls_valid_to: "2026-10-01T00:00:00.000Z", maintenance_enabled: 1 },
              { id: 4, name: "api-4", last_state: "fail", enabled: 0, last_latency_ms: null, tls_valid_to: null, maintenance_enabled: 0 },
            ],
          } as T;
        }
        if (normalized.includes("FROM incidents i JOIN checks c") && normalized.includes("WHERE i.resolved_at IS NULL")) {
          expect(normalized).toContain("AND c.enabled = 1");
          return {
            results: [
              {
                id: 10,
                check_id: 1,
                check_name: "api",
                check_url: "https://api.example.com",
                started_at: "2026-06-22T00:00:00.000Z",
                resolved_at: null,
                start_reason: "http_status",
                end_reason: null,
                start_status_code: 500,
                end_status_code: null,
                failure_count: 1,
                created_at: "2026-06-22T00:00:00.000Z",
                updated_at: "2026-06-22T00:00:00.000Z",
              },
            ],
          } as T;
        }
        if (normalized.includes("FROM incidents i JOIN checks c")) {
          return {
            results: [
              {
                id: 10,
                check_id: 1,
                check_name: "api",
                check_url: "https://api.example.com",
                started_at: "2026-06-22T00:00:00.000Z",
                resolved_at: null,
                start_reason: "http_status",
                end_reason: null,
                start_status_code: 500,
                end_status_code: null,
                failure_count: 1,
                created_at: "2026-06-22T00:00:00.000Z",
                updated_at: "2026-06-22T00:00:00.000Z",
              },
              {
                id: 11,
                check_id: 99,
                check_name: "disabled-api",
                check_url: "https://disabled.example.com",
                started_at: "2026-06-21T00:00:00.000Z",
                resolved_at: null,
                start_reason: "http_status",
                end_reason: null,
                start_status_code: 500,
                end_status_code: null,
                failure_count: 1,
                created_at: "2026-06-21T00:00:00.000Z",
                updated_at: "2026-06-21T00:00:00.000Z",
              },
            ],
          } as T;
        }
        if (normalized.includes("FROM check_results r JOIN checks c")) {
          return { results: [] } as T;
        }
        if (normalized.includes("FROM status_events e JOIN checks c")) {
          return { results: [] } as T;
        }
        return { results: [] } as T;
      },
      async run() {
        return emptyResult();
      },
      async raw(options?: { columnNames?: boolean }) {
        if (options?.columnNames) {
          return [[]] as [string[], ...unknown[][]];
        }
        return [] as unknown[][];
      },
    } as D1PreparedStatement;
  },
  async batch() {
    return [];
  },
  async exec() {
    return { count: 0, duration: 0 };
  },
  withSession() {
    throw new Error("not implemented");
  },
  async dump() {
    return new ArrayBuffer(0);
  },
});

describe("loadDashboardData", () => {
  it("returns dashboard data from the store", async () => {
    const data = await loadDashboardData(makeDb());

    expect(data.checks).toHaveLength(4);
    expect(data.recentChecks).toHaveLength(3);
    expect(data.recentChecks.map((check) => check.id)).toEqual([2, 1, 3]);
    expect(data.currentIncidents).toHaveLength(1);
    expect(data.incidents24h).toBe(2);
  });

  it("excludes disabled checks from dashboard summary metrics", () => {
    const summary = summarizeDashboard(
      [
        { id: 1, enabled: 1, last_state: "ok", last_latency_ms: 100, tls_valid_to: "2026-07-20T00:00:00.000Z" } as never,
        { id: 2, enabled: 1, last_state: "fail", last_latency_ms: 300, tls_valid_to: null } as never,
        { id: 3, enabled: 0, last_state: "ok", last_latency_ms: 999, tls_valid_to: "2026-07-11T00:00:00.000Z" } as never,
      ],
      [],
      "2026-07-10T00:00:00.000Z",
    );

    expect(summary).toEqual({
      totalChecks: 2,
      okChecks: 1,
      failedChecks: 1,
      certExpiringSoonChecks: 1,
      incidents24h: 0,
      averageLatencyMs: 200,
    });
  });

  it("includes attention checks in public status data for degraded state", () => {
    const data = buildPublicStatusData(
      {
        checks: [
          {
            id: 1,
            name: "tls-warning",
            url: "https://tls-warning.example.com",
            enabled: 1,
            last_state: "ok",
            last_status_code: 200,
            last_error: null,
            last_checked_at: "2026-07-10T00:00:00.000Z",
            tls_valid_to: "2026-07-20T00:00:00.000Z",
            tls_last_error: null,
            maintenance_enabled: 0,
          } as never,
        ],
        currentIncidents: [],
        generatedAt: "2026-07-10T00:05:00.000Z",
      },
      "2026-07-10T00:05:00.000Z",
    );

    expect(data.status).toBe("degraded");
    expect(data.attentionChecks).toEqual([
      {
        checkId: 1,
        checkName: "tls-warning",
        checkUrl: "https://tls-warning.example.com",
        state: "ok",
        statusCode: 200,
        error: null,
        checkedAt: "2026-07-10T00:00:00.000Z",
        certificate: {
          status: "warning",
          daysRemaining: 9,
          error: null,
        },
        maintenanceEnabled: false,
      },
    ]);
  });
});
