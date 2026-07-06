import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CheckRow } from "../../src/lib/checks";

const storeMocks = vi.hoisted(() => ({
  claimScheduledCheckRun: vi.fn(),
  ensureCheckRunForExecution: vi.fn(),
  getCheckForExecution: vi.fn(),
  getLatestRecoveryAt: vi.fn(),
  loadUndispatchedCheckRuns: vi.fn(),
  loadStaleCheckRuns: vi.fn(),
  markCheckRunDispatched: vi.fn(),
  clearCheckRunLease: vi.fn(),
  finishCheckRun: vi.fn(),
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
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  storeMocks.claimScheduledCheckRun.mockReset();
  storeMocks.ensureCheckRunForExecution.mockReset();
  storeMocks.getCheckForExecution.mockReset();
  storeMocks.getLatestRecoveryAt.mockReset();
  storeMocks.loadUndispatchedCheckRuns.mockReset();
  storeMocks.loadStaleCheckRuns.mockReset();
  storeMocks.markCheckRunDispatched.mockReset();
  storeMocks.clearCheckRunLease.mockReset();
  storeMocks.finishCheckRun.mockReset();
  storeMocks.persistCheckResult.mockReset();
  certMocks.describeCertificateAlert.mockReset();
  certMocks.probeCertificateSnapshot.mockReset();
});

describe("check execution service", () => {
  it("persists an invalid url result without fetching", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
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
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.getCheckForExecution.mockResolvedValue({
      ...baseCheck,
      maintenance_enabled: 1,
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

  it("finishes a run as skipped when the check is missing", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.getCheckForExecution.mockResolvedValue(null);
    storeMocks.finishCheckRun.mockResolvedValue(undefined);

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

    expect(storeMocks.finishCheckRun).toHaveBeenCalledWith(
      {} as never,
      { id: 1, finished_at: null, lease_until: null },
      expect.any(String),
      "skipped",
      "check_not_found",
    );
    expect(storeMocks.persistCheckResult).not.toHaveBeenCalled();
  });

  it("finishes a run as skipped when the check is disabled", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.getCheckForExecution.mockResolvedValue({ ...baseCheck, enabled: 0 });
    storeMocks.finishCheckRun.mockResolvedValue(undefined);

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

    expect(storeMocks.finishCheckRun).toHaveBeenCalledWith(
      {} as never,
      { id: 1, finished_at: null, lease_until: null },
      expect.any(String),
      "skipped",
      "check_disabled",
    );
    expect(storeMocks.persistCheckResult).not.toHaveBeenCalled();
  });

  it("throws when the run is still leased", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "leased", leaseUntil: "2026-06-22T00:15:00.000Z" });

    await expect(
      runCheck(
        {
          "pulse-db": {} as never,
        } as never,
        {
          checkId: 1,
          scheduledAt: "2026-06-22T00:00:00.000Z",
          attemptId: "attempt-1",
        },
      ),
    ).rejects.toThrow("check run is leased");
  });

  it("enqueues due checks and updates next_check_at", async () => {
    storeMocks.claimScheduledCheckRun.mockResolvedValue(true);
    storeMocks.loadStaleCheckRuns.mockResolvedValue([]);
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.markCheckRunDispatched.mockResolvedValue(undefined);
    storeMocks.finishCheckRun.mockResolvedValue(undefined);
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
          async first<T>() {
            if (normalized.startsWith("INSERT OR IGNORE INTO check_runs")) {
              return { id: 1 } as T;
            }
            return null as T;
          },
          async run() {
            return {};
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

  it("requeues stale runs before creating new work", async () => {
    storeMocks.loadStaleCheckRuns.mockResolvedValue([
      {
        id: 9,
        check_id: 7,
        attempt_id: "attempt-stale",
        scheduled_at: "2026-06-22T00:00:00.000Z",
        started_at: "2026-06-22T00:00:00.000Z",
        lease_until: "2026-06-22T00:01:00.000Z",
        finished_at: null,
        result_state: null,
        skip_reason: null,
        dispatched_at: "2026-06-22T00:00:00.000Z",
        created_at: "2026-06-22T00:00:00.000Z",
        updated_at: "2026-06-22T00:00:00.000Z",
      },
    ]);
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.clearCheckRunLease.mockResolvedValue(undefined);
    storeMocks.finishCheckRun.mockResolvedValue(undefined);
    storeMocks.getCheckForExecution.mockResolvedValue({
      ...baseCheck,
      id: 7,
      interval_minutes: 15,
    });

    const sent: unknown[] = [];
    const db = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async all<T>() {
            return { results: [] } as T;
          },
          async first<T>() {
            return null as T;
          },
          async run() {
            return {};
          },
        };
      },
    };

    await handleScheduled(
      { scheduledTime: Date.parse("2026-06-22T00:02:00.000Z"), cron: "* * * * *", noRetry() {} },
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
      attemptId: "attempt-stale",
    });
    expect(storeMocks.clearCheckRunLease).toHaveBeenCalledWith(db, "attempt-stale", "2026-06-22T00:02:00.000Z");
  });

  it("parses runtime headers into the persisted check result", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
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

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const requestInit = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(requestInit).toMatchObject({
      headers: {
        "user-agent": "edge-pulse-check/1.0",
      },
      redirect: "manual",
    });
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
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
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

  it("retries on D1 write failures", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.getCheckForExecution.mockResolvedValue(baseCheck);
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockRejectedValue(new Error("d1 failed"));
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);
    certMocks.describeCertificateAlert.mockReturnValue(null);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await expect(
      runCheck(
        {
          "pulse-db": {} as never,
        } as never,
        {
          checkId: 1,
          scheduledAt: "2026-06-22T00:00:00.000Z",
          attemptId: "attempt-1",
        },
      ),
    ).rejects.toThrow("d1 failed");
  });

  it("treats HTTP 500 as a monitored failure instead of throwing", async () => {
    storeMocks.ensureCheckRunForExecution.mockResolvedValue({ kind: "claimed", run: { id: 1, finished_at: null, lease_until: null } });
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([]);
    storeMocks.getCheckForExecution.mockResolvedValue(baseCheck);
    storeMocks.getLatestRecoveryAt.mockResolvedValue(null);
    storeMocks.persistCheckResult.mockResolvedValue(undefined);
    certMocks.probeCertificateSnapshot.mockResolvedValue(null);
    certMocks.describeCertificateAlert.mockReturnValue(null);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(
      runCheck(
        {
          "pulse-db": {} as never,
        } as never,
        {
          checkId: 1,
          scheduledAt: "2026-06-22T00:00:00.000Z",
          attemptId: "attempt-1",
        },
      ),
    ).resolves.toBeUndefined();

    expect(storeMocks.persistCheckResult).toHaveBeenCalledTimes(1);
    const [, , resultArg] = storeMocks.persistCheckResult.mock.calls[0] ?? [];
    expect(resultArg).toMatchObject({
      state: "fail",
      statusCode: 500,
      reason: "http_status",
    });
  });

  it("re-dispatches an undispatched run before creating new work", async () => {
    storeMocks.loadStaleCheckRuns.mockResolvedValue([]);
    storeMocks.loadUndispatchedCheckRuns.mockResolvedValue([
      {
        id: 9,
        check_id: 7,
        attempt_id: "attempt-pending",
        scheduled_at: "2026-06-22T00:00:00.000Z",
        started_at: null,
        lease_until: null,
        finished_at: null,
        result_state: null,
        skip_reason: null,
        dispatched_at: null,
        interval_minutes: 15,
        created_at: "2026-06-22T00:00:00.000Z",
        updated_at: "2026-06-22T00:00:00.000Z",
      },
    ]);
    storeMocks.markCheckRunDispatched.mockResolvedValue(undefined);
    storeMocks.finishCheckRun.mockResolvedValue(undefined);
    storeMocks.claimScheduledCheckRun.mockResolvedValue(false);
    storeMocks.getCheckForExecution.mockResolvedValue({
      ...baseCheck,
      id: 7,
      interval_minutes: 15,
    });

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
            return { results: [] } as T;
          },
          async first<T>() {
            return null as T;
          },
          async run() {
            return {};
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
      attemptId: "attempt-pending",
    });
    expect(storeMocks.markCheckRunDispatched).toHaveBeenCalledWith(db, "attempt-pending", "2026-06-22T00:00:00.000Z");
    expect(statements.some((entry) => entry.sql.startsWith("UPDATE checks"))).toBe(true);
  });
});
