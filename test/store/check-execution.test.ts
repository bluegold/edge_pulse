import { describe, expect, it } from "vitest";
import { buildCheckResult, type CheckRow } from "../../src/lib/checks";
import { getLatestRecoveryAt, persistCheckResult } from "../../src/store/check-execution";
import type { D1Database } from "../../src/lib/cloudflare";

type Statement = {
  sql: string;
  params: unknown[];
};

const makeDb = () => {
  const statements: Statement[] = [];
  const db: D1Database = {
    prepare(sql: string) {
      const normalized = sql.replaceAll(/\s+/g, " ").trim();
      const statement: {
        bind: (...params: unknown[]) => unknown;
        first: <T>() => Promise<T | null>;
        all: <T>() => Promise<T>;
        run: () => Promise<{}>;
      } = {
        bind(...params: unknown[]) {
          statements.push({ sql: normalized, params });
          return statement;
        },
        async first<T>() {
          if (normalized.includes("FROM status_events") && normalized.includes("from_state = 'fail'")) {
            return { occurred_at: "2026-06-22T00:10:00.000Z" } as T;
          }
          if (normalized.includes("FROM incidents")) {
            return null as T;
          }
          return null as T;
        },
        async all<T>() {
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

  return { db, statements };
};

const check: CheckRow = {
  id: 1,
  name: "api",
  url: "https://api.example.com",
  method: "GET",
  enabled: 1,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: null,
  last_enqueued_at: null,
  last_checked_at: null,
  last_state: "unknown",
  last_status_code: null,
  last_latency_ms: null,
  last_error: null,
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 0,
  consecutive_successes: 0,
  first_failure_at: null,
  first_success_at: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

describe("check execution store", () => {
  it("returns the latest recovery timestamp when the check is healthy again", async () => {
    const { db } = makeDb();
    const timestamp = await getLatestRecoveryAt(db, { ...check, last_state: "ok", tls_last_error: "x" });
    expect(timestamp).toBe("2026-06-22T00:10:00.000Z");
  });

  it("persists a successful result with the expected statements", async () => {
    const { db, statements } = makeDb();
    const result = buildCheckResult({
      state: "ok",
      statusCode: 200,
      latencyMs: 20,
      error: null,
      reason: "http_ok",
      checkedAt: "2026-06-22T00:11:00.000Z",
      xRuntimeMs: 980,
      serverTiming: [
        {
          name: "total",
          description: "UsersController#index",
          durationMs: 17.167,
          parameters: {
            desc: "UsersController#index",
            dur: 17.167,
          },
        },
      ],
    });

    const transition = await persistCheckResult(db, check, result, null);

    const insertStatement = statements.find((entry) => entry.sql.startsWith("INSERT INTO check_results"));
    expect(insertStatement?.params).toEqual([
      1,
      "ok",
      200,
      20,
      null,
      980,
      JSON.stringify([
        {
          name: "total",
          description: "UsersController#index",
          durationMs: 17.167,
          parameters: {
            desc: "UsersController#index",
            dur: 17.167,
          },
        },
      ]),
      "2026-06-22T00:11:00.000Z",
    ]);
    expect(insertStatement).toBeDefined();
    expect(statements.some((entry) => entry.sql.startsWith("UPDATE checks"))).toBe(true);
    expect(statements.some((entry) => entry.sql.startsWith("INSERT INTO incidents"))).toBe(false);
    expect(statements.some((entry) => entry.sql.startsWith("INSERT INTO status_events"))).toBe(false);
    expect(transition).toMatchObject({ kind: "none", nextState: "ok" });
  });
});
