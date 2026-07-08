import { describe, expect, it } from "vitest";
import { loadChecksPageData } from "../../src/store/checks";
import type { D1Database } from "../../src/lib/cloudflare";
import {
  buildCheckSearchAttributes,
  evaluateCheckSearchFilter,
  parseCheckOrder,
  parseCheckSearchFilter,
  matchesCheckTextQuery,
} from "../../src/lib/checks-search";

const makeDb = (
  rows: {
    checks: Array<Record<string, unknown>>;
    incidents: Array<{ check_id: number }>;
  },
  search: { q?: string; filter?: string; order?: string } = {},
): D1Database => {
  const recentIncidentCheckIds = new Set(rows.incidents.map((row) => row.check_id));
  const filterAst = search.filter ? parseCheckSearchFilter(search.filter) : null;

  const filteredChecks = rows.checks.filter((row) => {
    const check = row as any;
    if (!matchesCheckTextQuery(check, search.q ?? "")) {
      return false;
    }
    if (!filterAst) {
      return true;
    }
    return evaluateCheckSearchFilter(filterAst, buildCheckSearchAttributes(check, recentIncidentCheckIds.has(Number(row.id))));
  });

  const orderTerms = parseCheckOrder(search.order ?? "");
  const orderedChecks = filteredChecks.slice().sort((a, b) => {
    for (const term of orderTerms) {
      const direction = term.direction === "asc" ? 1 : -1;
      const aValue =
        term.key === "checked_at"
          ? String(a.last_checked_at ?? "")
          : term.key === "certificate_remain"
            ? String(a.tls_valid_to ?? "")
            : String(a.name ?? "");
      const bValue =
        term.key === "checked_at"
          ? String(b.last_checked_at ?? "")
          : term.key === "certificate_remain"
            ? String(b.tls_valid_to ?? "")
            : String(b.name ?? "");
      if (aValue === bValue) continue;
      if (aValue === "") return 1;
      if (bValue === "") return -1;
      return aValue < bValue ? -1 * direction : direction;
    }

    const aCreated = Date.parse(String(a.created_at ?? ""));
    const bCreated = Date.parse(String(b.created_at ?? ""));
    const aName = String(a.name ?? "");
    const bName = String(b.name ?? "");
    if (aName !== bName) {
      if (aName === "") return 1;
      if (bName === "") return -1;
      return aName < bName ? -1 : 1;
    }
    if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
      return bCreated - aCreated;
    }
    return Number(b.id) - Number(a.id);
  });

  return {
    prepare(sql: string) {
      const normalized = sql.replaceAll(/\s+/g, " ").trim();
      let boundArgs: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) {
          boundArgs = args;
          return statement;
        },
        async first<T>() {
          if (normalized.includes("COUNT(*) AS count") && normalized.includes("FROM checks c")) {
            return { count: filteredChecks.length } as T;
          }
          if (normalized.includes("COALESCE(SUM(CASE WHEN enabled = 1 AND last_state = 'ok' THEN 1 ELSE 0 END), 0) AS ok_checks")) {
            return {
              count: filteredChecks.length,
              ok_checks: filteredChecks.filter((check) => check.enabled === 1 && check.last_state === "ok").length,
              disabled_checks: filteredChecks.filter((check) => check.enabled === 0).length,
            } as T;
          }
          return null as T;
        },
        async all<T>() {
          if (normalized.includes("FROM checks c")) {
            if (normalized.includes("LIMIT ? OFFSET ?")) {
              const limit = Number(boundArgs[boundArgs.length - 2] ?? 20);
              const offset = Number(boundArgs[boundArgs.length - 1] ?? 0);
              return { results: orderedChecks.slice(offset, offset + limit) } as T;
            }
            return { results: filteredChecks } as T;
          }
          if (normalized.includes("FROM incidents WHERE started_at >= ?")) {
            return { results: rows.incidents } as T;
          }
          return { results: [] } as T;
        },
        async run() {
          return {};
        },
      };
      return statement as unknown as ReturnType<D1Database["prepare"]>;
    },
    async batch() {
      return [];
    },
  };
};

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
      makeDb(
        {
          checks: [
            { id: 1, name: "api-a", url: "https://api-a.example.com", enabled: 1, last_state: "ok", ...baseCheck },
            { id: 2, name: "api-b", url: "https://api-b.example.com", enabled: 1, last_state: "fail", ...baseCheck, tls_valid_to: "2026-07-13T00:00:00.000Z" },
            { id: 3, name: "docs", url: "https://docs.example.com", enabled: 0, last_state: "ok", ...baseCheck },
          ],
          incidents: [{ check_id: 2 }],
        },
        { q: "api", filter: "(&(enabled=1)(last_state=ok))" },
      ),
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
      makeDb(
        {
          checks: [
            { id: 1, name: "api-a", url: "https://api-a.example.com", enabled: 1, last_state: "ok", ...baseCheck },
            { id: 2, name: "api-b", url: "https://api-b.example.com", enabled: 1, last_state: "fail", ...baseCheck },
          ],
          incidents: [{ check_id: 2 }],
        },
        { filter: "(recent_incident_24h=1)" },
      ),
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
