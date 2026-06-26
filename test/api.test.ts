import { describe, expect, it } from "vitest";
import { app } from "../src/index.ts";
import type { CheckRow } from "../src/lib/checks";

type MockState = {
  checks: CheckRow[];
  nextId: number;
};

const makeCheck = (id: number, overrides: Partial<CheckRow> = {}): CheckRow => ({
  id,
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
  ...overrides,
});

const createDb = (state: MockState) => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();

    const statement = (params: unknown[] = []) => ({
      bind(...nextParams: unknown[]) {
        return statement(nextParams);
      },
      async first<T>() {
        if (normalized.includes("INSERT INTO checks") && normalized.includes("RETURNING id")) {
          const [name, url, method, enabled, expectedStatusMin, expectedStatusMax, timeoutMs, intervalMinutes, failThreshold, recoveryThreshold, createdAt, updatedAt] = params as [
            string,
            string,
            string,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            string,
            string,
          ];

          const id = state.nextId++;
          state.checks.push(
            makeCheck(id, {
              name,
              url,
              method,
              enabled,
              expected_status_min: expectedStatusMin,
              expected_status_max: expectedStatusMax,
              timeout_ms: timeoutMs,
              interval_minutes: intervalMinutes,
              fail_threshold: failThreshold,
              recovery_threshold: recoveryThreshold,
              created_at: createdAt,
              updated_at: updatedAt,
            }),
          );
          return { id } as T;
        }

        if (normalized === "SELECT * FROM checks WHERE id = ? LIMIT 1") {
          const [id] = params as [number];
          return (state.checks.find((check) => check.id === id) ?? null) as T;
        }

        if (normalized === "SELECT COUNT(*) AS count FROM checks") {
          return { count: state.checks.length } as T;
        }

        if (normalized.includes("FROM incidents") || normalized.includes("FROM check_results") || normalized.includes("FROM status_events")) {
          return { count: 0 } as T;
        }

        return null as T;
      },
      async all<T>() {
        if (normalized.startsWith("SELECT * FROM checks ORDER BY")) {
          const [limit, offset] = params as [number, number];
          return {
            results: state.checks.slice(offset, offset + limit),
          } as T;
        }

        if (normalized.includes("FROM incidents") || normalized.includes("FROM check_results") || normalized.includes("FROM status_events")) {
          return { results: [] } as T;
        }

        return { results: [] } as T;
      },
      async run() {
        return {};
      },
    });

    return statement();
  },
});

const makeEnv = (state: MockState) => ({
  "pulse-db": createDb(state),
  "pulse-queue": { send: async () => {} },
  ASSETS: {
    async fetch(input: RequestInfo | URL) {
      const url = typeof input === "string" || input instanceof URL ? new URL(input.toString(), "http://localhost") : new URL(input.url);
      if (url.pathname === "/auto-reload.js") {
        return new Response("edge-pulse:auto-reload; dashboard-auto-reload-toggle;", {
          headers: { "content-type": "application/javascript; charset=utf-8" },
        });
      }

      return new Response("not found", { status: 404 });
    },
  },
  ADMIN_API_TOKEN: "secret-token",
});

describe("api auth", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await app.request(
      "http://localhost/api/checks",
      {
        method: "GET",
      },
      makeEnv({ checks: [], nextId: 1 }),
    );

    expect(response.status).toBe(401);
  });
});

describe("api checks", () => {
  it("creates a check from json", async () => {
    const state: MockState = { checks: [], nextId: 1 };

    const response = await app.request(
      "http://localhost/api/checks",
      {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "payments.example.com",
          url: "https://payments.example.com",
          enabled: true,
          interval_minutes: 10,
          fail_threshold: 2,
          recovery_threshold: 1,
        }),
      },
      makeEnv(state),
    );

    expect(response.status).toBe(201);

    const payload = (await response.json()) as { check: CheckRow | null };
    expect(payload.check?.id).toBe(1);
    expect(payload.check?.name).toBe("payments.example.com");
    expect(state.checks).toHaveLength(1);
  });

  it("creates a check from form data", async () => {
    const state: MockState = { checks: [], nextId: 1 };

    const body = new URLSearchParams({
      name: "billing.example.com",
      url: "https://billing.example.com",
      enabled: "1",
      interval_minutes: "15",
      fail_threshold: "3",
      recovery_threshold: "2",
    });

    const response = await app.request(
      "http://localhost/api/checks",
      {
        method: "POST",
        headers: {
          authorization: "Bearer secret-token",
        },
        body,
      },
      makeEnv(state),
    );

    expect(response.status).toBe(201);

    const payload = (await response.json()) as { check: CheckRow | null };
    expect(payload.check?.id).toBe(1);
    expect(payload.check?.name).toBe("billing.example.com");
    expect(state.checks).toHaveLength(1);
  });
});

describe("hx navigation", () => {
  it("serves the auto reload script asset", async () => {
    const response = await app.request(
      "http://localhost/assets/auto-reload.js",
      {},
      makeEnv({ checks: [makeCheck(1)], nextId: 2 }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");

    const text = await response.text();
    expect(text).toContain("edge-pulse:auto-reload");
    expect(text).toContain('dashboard-auto-reload-toggle');
  });

  it("returns a dashboard fragment for htmx root navigation", async () => {
    const response = await app.request(
      "http://localhost/",
      {
        headers: {
          "HX-Request": "true",
        },
      },
      makeEnv({ checks: [makeCheck(1)], nextId: 2 }),
    );

    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain('id="content"');
    expect(html).not.toContain("<html");
    expect(html).toContain('<main id="content"');
  });

  it("returns a checks fragment for htmx checks navigation", async () => {
    const response = await app.request(
      "http://localhost/checks?page=1",
      {
        headers: {
          "HX-Request": "true",
        },
      },
      makeEnv({ checks: [makeCheck(1)], nextId: 2 }),
    );

    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain('id="content"');
    expect(html).toContain('<main id="content"');
    expect(html).not.toContain("<html");
  });
});
