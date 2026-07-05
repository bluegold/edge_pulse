import { describe, expect, it } from "vitest";
import { loadDashboardData } from "../../src/store/dashboard";
import type { D1Database } from "../../src/lib/cloudflare";

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
        if (normalized === "SELECT * FROM checks ORDER BY created_at DESC, id DESC") {
          return {
            results: [
              { id: 1, name: "api", last_state: "ok", enabled: 1, last_latency_ms: 10, tls_days_remaining: 30, maintenance_enabled: 0 },
              { id: 2, name: "api-2", last_state: "fail", enabled: 1, last_latency_ms: null, tls_days_remaining: null },
              { id: 3, name: "api-3", last_state: "ok", enabled: 1, last_latency_ms: 8, tls_days_remaining: 90, maintenance_enabled: 1 },
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
        return {};
      },
    } as unknown as ReturnType<D1Database["prepare"]>;
  },
  async batch() {
    return [];
  },
});

describe("loadDashboardData", () => {
  it("returns dashboard data from the store", async () => {
    const data = await loadDashboardData(makeDb());

    expect(data.checks).toHaveLength(3);
    expect(data.recentChecks).toHaveLength(3);
    expect(data.recentChecks.map((check) => check.id)).toEqual([2, 3, 1]);
    expect(data.currentIncidents).toHaveLength(1);
    expect(data.incidents24h).toBe(2);
  });
});
