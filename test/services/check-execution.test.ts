import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CheckRow } from "../../src/lib/checks";

const storeMocks = vi.hoisted(() => ({
  getCheckForExecution: vi.fn(),
  getLatestRecoveryAt: vi.fn(),
  persistCheckResult: vi.fn(),
}));

const certMocks = vi.hoisted(() => ({
  describeCertificateAlert: vi.fn(),
  probeCertificateSnapshot: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  dispatchNotifications: vi.fn(),
}));

vi.mock("../../src/store/check-execution", () => storeMocks);
vi.mock("../../src/services/certificate-check", () => certMocks);
vi.mock("../../src/services/notifications", () => notificationMocks);

import { runCheck, handleScheduled } from "../../src/services/check-execution";

const baseCheck: CheckRow = {
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
  maintenance_enabled: 0,
  maintenance_until: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  storeMocks.getCheckForExecution.mockReset();
  storeMocks.getLatestRecoveryAt.mockReset();
  storeMocks.persistCheckResult.mockReset();
  certMocks.describeCertificateAlert.mockReset();
  certMocks.probeCertificateSnapshot.mockReset();
});

describe("check execution service", () => {
  it("persists an invalid url result without fetching", async () => {
    storeMocks.getCheckForExecution.mockResolvedValue({ ...baseCheck, url: "not-a-url" });
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockResolvedValue(undefined);
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("should not be called"));

    await runCheck(
      {
        "pulse-db": {} as never,
      } as never,
      {
        checkId: 1,
        scheduledAt: "2026-06-22T00:00:00.000Z",
        attemptId: "attempt-1",
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storeMocks.persistCheckResult).toHaveBeenCalledTimes(1);
    const [, checkArg, resultArg, certificateArg] = storeMocks.persistCheckResult.mock.calls[0] ?? [];
    expect(checkArg).toEqual({ ...baseCheck, url: "not-a-url" });
    expect(resultArg).toMatchObject({
      state: "fail",
      statusCode: null,
      latencyMs: null,
      error: "URL の形式が不正です",
      reason: "invalid_url",
    });
    expect(typeof resultArg?.checkedAt).toBe("string");
    expect(certificateArg).toBeNull();
  });

  it("suppresses notifications while maintenance is active", async () => {
    storeMocks.getCheckForExecution.mockResolvedValue({
      ...baseCheck,
      maintenance_enabled: 1,
      maintenance_until: "2030-01-01T00:00:00.000Z",
    });
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockResolvedValue({ kind: "incident-opened", nextState: "fail", startedAt: "2026-06-22T00:00:00.000Z" });
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);
    certMocks.describeCertificateAlert.mockReturnValue(null);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await runCheck(
      {
        "pulse-db": {} as never,
      } as never,
      {
        checkId: 1,
        scheduledAt: "2026-06-22T00:00:00.000Z",
        attemptId: "attempt-1",
      },
    );

    expect(notificationMocks.dispatchNotifications).not.toHaveBeenCalled();
  });

  it("enqueues due checks and updates next_check_at", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const normalized = sql.replaceAll(/\s+/g, " ").trim();
        return {
          bind(...params: unknown[]) {
            statements.push({ sql: normalized, params });
            return this;
          },
          async all<T>() {
            return { results: [{ id: 7, interval_minutes: 15 }] } as T;
          },
          async run() {
            return {};
          },
          async first<T>() {
            return null as T;
          },
        };
      },
    };
    const sent: unknown[] = [];

    await handleScheduled(
      { scheduledTime: Date.parse("2026-06-22T00:00:00.000Z"), cron: "* * * * *", noRetry() {} },
      {
        "pulse-db": db as never,
        "pulse-queue": {
          send: async (message: { checkId: number; scheduledAt: string; attemptId: string }) => {
            sent.push(message);
          },
        },
      } as never,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      checkId: 7,
      scheduledAt: "2026-06-22T00:00:00.000Z",
      attemptId: expect.any(String),
    });
    expect(statements.some((entry) => entry.sql.startsWith("UPDATE checks"))).toBe(true);
  });

  it("parses runtime headers into the persisted check result", async () => {
    storeMocks.getCheckForExecution.mockResolvedValue(baseCheck);
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockResolvedValue(undefined);
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);
    certMocks.describeCertificateAlert.mockReturnValue(null);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "X-Runtime": "0.98",
          "Server-Timing": 'total;desc="UsersController#index";dur=17.167, db;dur=0.5440000677481294',
        },
      }),
    );

    await runCheck(
      {
        "pulse-db": {} as never,
      } as never,
      {
        checkId: 1,
        scheduledAt: "2026-06-22T00:00:00.000Z",
        attemptId: "attempt-1",
      },
    );

    expect(storeMocks.persistCheckResult).toHaveBeenCalledTimes(1);
    const [, , resultArg] = storeMocks.persistCheckResult.mock.calls[0] ?? [];
    expect(resultArg).toMatchObject({
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
        {
          name: "db",
          description: null,
          durationMs: 0.5440000677481294,
          parameters: {
            dur: 0.5440000677481294,
          },
        },
      ],
    });
  });

  it("falls back to server timing when x-runtime is missing", async () => {
    storeMocks.getCheckForExecution.mockResolvedValue(baseCheck);
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockResolvedValue(undefined);
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);
    certMocks.describeCertificateAlert.mockReturnValue(null);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: {
          "Server-Timing": 'total;desc="UsersController#index";dur=17.167, db;dur=0.5440000677481294',
        },
      }),
    );

    await runCheck(
      {
        "pulse-db": {} as never,
      } as never,
      {
        checkId: 1,
        scheduledAt: "2026-06-22T00:00:00.000Z",
        attemptId: "attempt-1",
      },
    );

    const [, , resultArg] = storeMocks.persistCheckResult.mock.calls[0] ?? [];
    expect(resultArg).toMatchObject({
      xRuntimeMs: 17.167,
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
        {
          name: "db",
          description: null,
          durationMs: 0.5440000677481294,
          parameters: {
            dur: 0.5440000677481294,
          },
        },
      ],
    });
  });
});
