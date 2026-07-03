import { describe, expect, it } from "vitest";
import { loadChecksPageData } from "../../src/store/checks";
import type { D1Database } from "../../src/lib/cloudflare";

const makeDb = (rows: {
  checks: Array<Record<string, unknown>>;
  incidents: Array<{ check_id: number }>;
}): D1Database => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();
    return {
      bind(..._args: unknown[]) {
        return this;
      },
      async first<T>() {
        return null as T;
      },
      async all<T>() {
        if (normalized.includes("FROM checks ORDER BY created_at DESC, id DESC")) {
          return { results: rows.checks } as T;
        }
        if (normalized.includes("FROM incidents WHERE started_at >= ?")) {
          return { results: rows.incidents } as T;
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

const now = "2026-07-03T00:00:00.000Z";

const baseCheck = {
  method: "GET",
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: null,
  last_enqueued_at: null,
  last_checked_at: now,
  last_status_code: 200,
  last_latency_ms: 80,
  last_error: null,
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 0,
  consecutive_successes: 0,
  first_failure_at: null,
  first_success_at: null,
  tls_last_checked_at: null,
  tls_last_error: null,
  tls_subject: null,
  tls_issuer: null,
  tls_public_key_class: null,
  tls_valid_from: null,
  tls_valid_to: null,
  tls_days_remaining: null,
  tls_dns_names: null,
  created_at: now,
  updated_at: now,
};

describe("loadChecksPageData", () => {
  it("normalizes page numbers and returns checks", async () => {
    const data = await loadChecksPageData(
      makeDb({
        checks: [
          { id: 1, name: "api-a", url: "https://api-a.example.com", enabled: 1, last_state: "ok", ...baseCheck },
          { id: 2, name: "api-b", url: "https://api-b.example.com", enabled: 1, last_state: "fail", ...baseCheck },
        ],
        incidents: [],
      }),
      0,
      2,
      3,
    );

    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    expect(data.totalChecks).toBe(2);
    expect(data.totalPages).toBe(1);
    expect(data.editId).toBe(2);
    expect(data.highlightId).toBe(3);
    expect(data.q).toBe("");
    expect(data.filter).toBe("");
    expect(data.searchError).toBeNull();
    expect(data.checks).toHaveLength(2);
  });

  it("filters by q and LDAP-like filter, including derived attributes", async () => {
    const data = await loadChecksPageData(
      makeDb({
        checks: [
          { id: 1, name: "api-a", url: "https://api-a.example.com", enabled: 1, last_state: "ok", ...baseCheck },
          { id: 2, name: "api-b", url: "https://api-b.example.com", enabled: 1, last_state: "fail", ...baseCheck, tls_days_remaining: 10 },
          { id: 3, name: "docs", url: "https://docs.example.com", enabled: 0, last_state: "ok", ...baseCheck },
        ],
        incidents: [{ check_id: 2 }],
      }),
      1,
      null,
      null,
      "api",
      "(&(enabled=1)(last_state=ok))",
    );

    expect(data.totalChecks).toBe(1);
    expect(data.totalPages).toBe(1);
    expect(data.checks).toHaveLength(1);
    expect(data.checks[0]?.id).toBe(1);
  });

  it("marks recent incidents through the derived filter attribute", async () => {
    const data = await loadChecksPageData(
      makeDb({
        checks: [
          { id: 1, name: "api-a", url: "https://api-a.example.com", enabled: 1, last_state: "ok", ...baseCheck },
          { id: 2, name: "api-b", url: "https://api-b.example.com", enabled: 1, last_state: "fail", ...baseCheck },
        ],
        incidents: [{ check_id: 2 }],
      }),
      1,
      null,
      null,
      "",
      "(recent_incident_24h=1)",
    );

    expect(data.totalChecks).toBe(1);
    expect(data.checks[0]?.id).toBe(2);
  });
});
