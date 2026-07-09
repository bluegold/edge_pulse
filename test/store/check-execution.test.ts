import { describe, expect, it } from "vitest";
import { buildCheckResult, type CheckJob, type CheckRow, type CheckRunRow } from "../../src/lib/checks";
import {
  claimScheduledCheckRun,
  ensureCheckRunForExecution,
  getLatestRecoveryAt,
  finishCheckRun,
  persistCheckResult,
} from "../../src/store/check-execution";

type Statement = {
  sql: string;
  params: unknown[];
};

type MockStatement = D1PreparedStatement & Statement;

const d1Meta: D1Meta & Record<string, unknown> = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 0,
  changed_db: false,
  changes: 0,
};

const emptyResult = <T>(): D1Result<T> => ({ success: true as const, meta: d1Meta, results: [] as T[] });

type TestState = {
  check: CheckRow;
  checkRuns: CheckRunRow[];
  incidents: Array<{
    id: number;
    check_id: number;
    started_at: string;
    resolved_at: string | null;
    start_reason: string | null;
    end_reason: string | null;
    start_status_code: number | null;
    end_status_code: number | null;
    failure_count: number;
  }>;
  results: Statement[];
  events: Statement[];
  statements: Statement[];
  nextCheckRunId: number;
  nextIncidentId: number;
  batchFailuresRemaining: number;
};

const normalizeSql = (sql: string): string => sql.replaceAll(/\s+/g, " ").trim();

const makeCheckRun = (overrides: Partial<CheckRunRow> = {}): CheckRunRow => ({
  id: 1,
  check_id: 1,
  attempt_id: "attempt-1",
  scheduled_at: "2026-06-22T00:00:00.000Z",
  started_at: null,
  lease_until: null,
  finished_at: null,
  result_state: null,
  skip_reason: null,
  dispatched_at: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
  ...overrides,
});

const makeDb = (overrides: Partial<TestState> = {}) => {
  const state: TestState = {
    check: {
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
    },
    checkRuns: [],
    incidents: [],
    results: [],
    events: [],
    statements: [],
    nextCheckRunId: 1,
    nextIncidentId: 1,
    batchFailuresRemaining: 0,
    ...overrides,
  };

  const applyStatement = (normalized: string, params: unknown[]): void => {
    state.statements.push({ sql: normalized, params });

    if (normalized.startsWith("INSERT INTO check_results") || normalized.startsWith("INSERT OR IGNORE INTO check_results")) {
      const [checkId, checkRunId] = params as [number, number];
      const exists = state.results.some((entry) => {
        const [existingCheckId, existingRunId] = entry.params as [number, number, ...unknown[]];
        return existingCheckId === checkId && existingRunId === checkRunId;
      });
      if (!exists) {
        state.results.push({ sql: normalized, params });
      }
      return;
    }

    if (normalized.startsWith("UPDATE checks SET last_checked_at = ?, last_state = ?, last_status_code = ?")) {
      const [
        lastCheckedAt,
        lastState,
        lastStatusCode,
        lastLatencyMs,
        lastError,
        consecutiveFailures,
        consecutiveSuccesses,
        firstFailureAt,
        firstSuccessAt,
        updatedAt,
      ] = params as [string, string, number | null, number | null, string | null, number, number, string | null, string | null, string];

      state.check = {
        ...state.check,
        last_checked_at: lastCheckedAt,
        last_state: lastState as CheckRow["last_state"],
        last_status_code: lastStatusCode,
        last_latency_ms: lastLatencyMs,
        last_error: lastError,
        consecutive_failures: consecutiveFailures,
        consecutive_successes: consecutiveSuccesses,
        first_failure_at: firstFailureAt,
        first_success_at: firstSuccessAt,
        updated_at: updatedAt,
      };
      return;
    }

    if (normalized.startsWith("UPDATE checks SET last_checked_at = ?, last_state = ?, last_status_code = ?, last_latency_ms = ?, last_error = ?, consecutive_failures = ?, consecutive_successes = ?, first_failure_at = ?, first_success_at = ?, tls_last_checked_at = COALESCE(?, tls_last_checked_at)")) {
      const [
        lastCheckedAt,
        lastState,
        lastStatusCode,
        lastLatencyMs,
        lastError,
        consecutiveFailures,
        consecutiveSuccesses,
        firstFailureAt,
        firstSuccessAt,
        tlsLastCheckedAt,
        tlsLastError,
        tlsSubject,
        tlsIssuer,
        tlsClass,
        tlsValidFrom,
        tlsValidTo,
        tlsDaysRemaining,
        tlsDnsNames,
        updatedAt,
        _checkId,
      ] = params as [
        string,
        string,
        number | null,
        number | null,
        string | null,
        number,
        number,
        string | null,
        string | null,
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

      state.check = {
        ...state.check,
        last_checked_at: lastCheckedAt,
        last_state: lastState as CheckRow["last_state"],
        last_status_code: lastStatusCode,
        last_latency_ms: lastLatencyMs,
        last_error: lastError,
        consecutive_failures: consecutiveFailures,
        consecutive_successes: consecutiveSuccesses,
        first_failure_at: firstFailureAt,
        first_success_at: firstSuccessAt,
        tls_last_checked_at: tlsLastCheckedAt,
        tls_last_error: tlsLastError,
        tls_subject: tlsSubject,
        tls_issuer: tlsIssuer,
        tls_public_key_class: tlsClass,
        tls_valid_from: tlsValidFrom,
        tls_valid_to: tlsValidTo,
        tls_days_remaining: tlsDaysRemaining,
        tls_dns_names: tlsDnsNames,
        updated_at: updatedAt,
      };
      return;
    }

    if (normalized.startsWith("INSERT INTO incidents") || normalized.startsWith("INSERT OR IGNORE INTO incidents")) {
      const [checkId, startedAt, startReason, startStatusCode, createdAt, updatedAt] = params as [
        number,
        string,
        string | null,
        number | null,
        string,
        string,
      ];
      const exists = state.incidents.some((incident) => incident.check_id === checkId && incident.resolved_at === null);
      if (!exists) {
        state.incidents.push({
          id: state.nextIncidentId++,
          check_id: checkId,
          started_at: startedAt,
          resolved_at: null,
          start_reason: startReason,
          end_reason: null,
          start_status_code: startStatusCode,
          end_status_code: null,
          failure_count: 1,
        });
      }
      state.check.updated_at = updatedAt;
      state.check.last_checked_at = createdAt;
      return;
    }

    if (normalized.startsWith("UPDATE incidents SET failure_count = ?, updated_at = ?")) {
      const [failureCount, updatedAt, id] = params as [number, string, number];
      const incident = state.incidents.find((entry) => entry.id === id);
      if (incident) incident.failure_count = failureCount;
      state.check.updated_at = updatedAt;
      return;
    }

    if (normalized.startsWith("UPDATE incidents SET resolved_at = ?, end_reason = ?, end_status_code = ?, updated_at = ?")) {
      const [resolvedAt, endReason, endStatusCode, updatedAt, id] = params as [
        string,
        string | null,
        number | null,
        string,
        number,
      ];
      const incident = state.incidents.find((entry) => entry.id === id);
      if (incident) {
        incident.resolved_at = resolvedAt;
        incident.end_reason = endReason;
        incident.end_status_code = endStatusCode;
      }
      state.check.updated_at = updatedAt;
      return;
    }

    if (normalized.startsWith("INSERT INTO status_events") || normalized.startsWith("INSERT OR IGNORE INTO status_events")) {
      const checkRunId = params[1] as number | null | undefined;
      const exists = checkRunId != null
        ? state.events.some((entry) => (entry.params[1] as number | null | undefined) === checkRunId)
        : false;
      if (!exists) {
        state.events.push({ sql: normalized, params });
      }
      return;
    }

    if (normalized.startsWith("UPDATE check_runs SET finished_at = ?, result_state = ?")) {
      const runId = params.at(-1) as number;
      const run = state.checkRuns.find((entry) => entry.id === runId);
      if (run && run.finished_at === null) {
        const [finishedAt, resultState] = params as [string, string];
        const updatedAt = params[params.length - 2] as string;
        run.finished_at = finishedAt;
        run.result_state = resultState as CheckRunRow["result_state"];
        run.skip_reason = normalized.includes("skip_reason = ?") ? (params[2] as string | null) : null;
        run.lease_until = null;
        run.updated_at = updatedAt;
      }
      return;
    }

    if (normalized.startsWith("INSERT OR IGNORE INTO check_runs")) {
      const [checkId, attemptId, scheduledAt, createdAt, updatedAt] = params as [number, string, string, string, string];
      const exists = state.checkRuns.some(
        (run) => run.attempt_id === attemptId || (run.check_id === checkId && run.scheduled_at === scheduledAt),
      );
      if (!exists) {
        state.checkRuns.push(
          makeCheckRun({
            id: state.nextCheckRunId++,
            check_id: checkId,
            attempt_id: attemptId,
            scheduled_at: scheduledAt,
            created_at: createdAt,
            updated_at: updatedAt,
          }),
        );
      }
      return;
    }
  };

  const db: D1Database = {
    prepare(sql: string) {
      const normalized = normalizeSql(sql);
      const statement: MockStatement = {
        sql: normalized,
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (normalized.includes("FROM status_events") && normalized.includes("from_state = 'fail'")) {
            return { occurred_at: "2026-06-22T00:10:00.000Z" } as T;
          }

          if (normalized.startsWith("UPDATE check_runs SET started_at = COALESCE(started_at, ?), lease_until = ?, updated_at = ?")) {
            const [startedAt, leaseUntil, updatedAt, attemptId, now] = statement.params as [string, string, string, string, string];
            const run = state.checkRuns.find((entry) => entry.attempt_id === attemptId);
            if (!run || run.finished_at !== null) return null as T;
            if (run.lease_until !== null && run.lease_until > now) return null as T;
            if (run.started_at === null) {
              run.started_at = startedAt;
            }
            run.lease_until = leaseUntil;
            run.updated_at = updatedAt;
            return run as T;
          }

          if (normalized === "SELECT COUNT(*) AS count FROM check_results WHERE check_id = ? AND state = 'fail' AND checked_at >= ?") {
            const [checkId, checkedAt] = statement.params as [number, string];
            const count = state.results.filter((entry) => {
              const [entryCheckId, , stateValue, , , , , , entryCheckedAt] = entry.params as [
                number,
                number,
                string,
                number | null,
                number | null,
                string | null,
                number | null,
                string | null,
                string,
              ];
              return entryCheckId === checkId && stateValue === "fail" && entryCheckedAt >= checkedAt;
            }).length;
            return { count } as T;
          }

          if (normalized === "SELECT id, started_at FROM incidents WHERE check_id = ? AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1") {
            const incident = state.incidents.find((entry) => entry.check_id === state.check.id && entry.resolved_at === null);
            return incident ? ({ id: incident.id, started_at: incident.started_at } as T) : (null as T);
          }

          if (normalized.includes("FROM incidents") && normalized.includes("resolved_at IS NULL")) {
            return state.incidents.find((incident) => incident.check_id === state.check.id && incident.resolved_at === null) as T;
          }

          if (normalized === "SELECT finished_at FROM check_runs WHERE attempt_id = ? LIMIT 1") {
            const [attemptId] = statement.params as [string];
            return (
              state.checkRuns.find((run) => run.attempt_id === attemptId)?.finished_at ? { finished_at: state.checkRuns.find((run) => run.attempt_id === attemptId)?.finished_at } : null
            ) as T;
          }

          if (normalized === "SELECT * FROM check_runs WHERE attempt_id = ? LIMIT 1") {
            const [attemptId] = statement.params as [string];
            return (state.checkRuns.find((run) => run.attempt_id === attemptId) ?? null) as T;
          }

          if (normalized.startsWith("INSERT OR IGNORE INTO check_runs") && normalized.includes("RETURNING id")) {
            const [checkId, attemptId, scheduledAt, createdAt, updatedAt] = statement.params as [number, string, string, string, string];
            const exists = state.checkRuns.some(
              (run) => run.attempt_id === attemptId || (run.check_id === checkId && run.scheduled_at === scheduledAt),
            );
            if (exists) return null as T;

            const inserted = makeCheckRun({
              id: state.nextCheckRunId++,
              check_id: checkId,
              attempt_id: attemptId,
              scheduled_at: scheduledAt,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            state.checkRuns.push(inserted);
            return { id: inserted.id } as T;
          }

          if (normalized.startsWith("INSERT OR IGNORE INTO incidents") && normalized.includes("RETURNING id")) {
            const [checkId, startedAt, startReason, startStatusCode, createdAt, updatedAt] = statement.params as [
              number,
              string,
              string | null,
              number | null,
              string,
              string,
            ];
            const exists = state.incidents.some((incident) => incident.check_id === checkId && incident.resolved_at === null);
            if (exists) return null as T;

            const inserted = {
              id: state.nextIncidentId++,
              check_id: checkId,
              started_at: startedAt,
              resolved_at: null,
              start_reason: startReason,
              end_reason: null,
              start_status_code: startStatusCode,
              end_status_code: null,
              failure_count: 1,
            };
            state.incidents.push(inserted);
            state.check.updated_at = updatedAt;
            state.check.last_checked_at = createdAt;
            return { id: inserted.id } as T;
          }

          if (normalized === "SELECT * FROM checks WHERE id = ? LIMIT 1") {
            return state.check as T;
          }

          if (normalized === "SELECT id FROM incidents WHERE check_id = ? AND resolved_at IS NULL ORDER BY started_at DESC LIMIT 1") {
            const incident = state.incidents.find((entry) => entry.check_id === state.check.id && entry.resolved_at === null);
            return incident ? ({ id: incident.id } as T) : (null as T);
          }

          return null as T;
        },
        async all<T>() {
          return { results: [] } as T;
        },
        async run() {
          applyStatement(normalized, statement.params);
          return emptyResult();
        },
        raw: (async (options?: { columnNames?: boolean }) => {
          if (options?.columnNames) {
            return [[]] as [string[], ...unknown[][]];
          }
          return [] as unknown[][];
        }) as D1PreparedStatement["raw"],
      };
      return statement;
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      if (state.batchFailuresRemaining > 0) {
        state.batchFailuresRemaining -= 1;
        throw new Error("batch failed");
      }

      for (const statement of statements as MockStatement[]) {
        applyStatement(statement.sql, statement.params);
      }
      return [] as T[];
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
  };

  return { db, state };
};

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

describe("check execution store", () => {
  it("returns the latest recovery timestamp when the check is healthy again", async () => {
    const { db } = makeDb();
    const timestamp = await getLatestRecoveryAt(db, { ...baseCheck, last_state: "ok", tls_last_error: "x" });
    expect(timestamp).toBe("2026-06-22T00:10:00.000Z");
  });

  it("claims a scheduled check run only once", async () => {
    const { db, state } = makeDb();
    const job: CheckJob = {
      checkId: 1,
      scheduledAt: "2026-06-22T00:00:00.000Z",
      attemptId: "attempt-1",
    };

    await expect(claimScheduledCheckRun(db, job, "2026-06-22T00:00:00.000Z")).resolves.toBe(true);
    await expect(claimScheduledCheckRun(db, job, "2026-06-22T00:00:00.000Z")).resolves.toBe(false);
    expect(state.checkRuns).toHaveLength(1);
  });

  it("persists a successful result with the expected statements", async () => {
    const { db, state } = makeDb({
      checkRuns: [makeCheckRun()],
    });
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

    const transition = await persistCheckResult(db, baseCheck, result, null, state.checkRuns[0]!);

    const insertStatement = state.statements.find((entry) => entry.sql.startsWith("INSERT OR IGNORE INTO check_results"));
    expect(insertStatement?.params).toEqual([
      1,
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
    expect(state.statements.some((entry) => entry.sql.startsWith("UPDATE checks"))).toBe(true);
    expect(state.statements.some((entry) => entry.sql.startsWith("INSERT OR IGNORE INTO incidents"))).toBe(false);
    expect(state.statements.some((entry) => entry.sql.startsWith("INSERT INTO status_events") || entry.sql.startsWith("INSERT OR IGNORE INTO status_events"))).toBe(true);
    expect(state.checkRuns[0]?.finished_at).toBe("2026-06-22T00:11:00.000Z");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.params.slice(2, 4)).toEqual(["unknown", "ok"]);
    expect(transition).toMatchObject({ kind: "state-initialized", nextState: "ok" });
  });

  it("claims a check run with a lease before persisting the result", async () => {
    const { db, state } = makeDb({
      checkRuns: [makeCheckRun()],
    });

    const claim = await ensureCheckRunForExecution(db, { checkId: 1, scheduledAt: "2026-06-22T00:00:00.000Z", attemptId: "attempt-1" }, "2026-06-22T00:10:30.000Z");

    expect(claim).toMatchObject({
      kind: "claimed",
      run: {
        started_at: "2026-06-22T00:10:30.000Z",
        lease_until: "2026-06-22T00:15:30.000Z",
      },
    });

    const second = await ensureCheckRunForExecution(db, { checkId: 1, scheduledAt: "2026-06-22T00:00:00.000Z", attemptId: "attempt-1" }, "2026-06-22T00:11:00.000Z");
    expect(second).toMatchObject({
      kind: "leased",
      leaseUntil: "2026-06-22T00:15:30.000Z",
    });
  });

  it("returns finished when the run is already done", async () => {
    const { db } = makeDb({
      checkRuns: [makeCheckRun({ finished_at: "2026-06-22T00:10:30.000Z" })],
    });

    await expect(
      ensureCheckRunForExecution(
        db,
        { checkId: 1, scheduledAt: "2026-06-22T00:00:00.000Z", attemptId: "attempt-1" },
        "2026-06-22T00:11:00.000Z",
      ),
    ).resolves.toMatchObject({ kind: "finished" });
  });

  it("returns missing when the run does not exist", async () => {
    const { db } = makeDb();

    await expect(
      ensureCheckRunForExecution(
        db,
        { checkId: 1, scheduledAt: "2026-06-22T00:00:00.000Z", attemptId: "attempt-1" },
        "2026-06-22T00:11:00.000Z",
      ),
    ).resolves.toMatchObject({ kind: "missing" });
  });

  it("finishes a skipped check run", async () => {
    const { db, state } = makeDb({
      checkRuns: [makeCheckRun()],
    });

    await finishCheckRun(db, state.checkRuns[0]!, "2026-06-22T00:10:30.000Z", "skipped", "check_disabled");

    expect(state.checkRuns[0]?.finished_at).toBe("2026-06-22T00:10:30.000Z");
    expect(state.checkRuns[0]?.result_state).toBe("skipped");
    expect(state.checkRuns[0]?.skip_reason).toBe("check_disabled");
  });

  it("does not duplicate incident open on the same attempt", async () => {
    const { db, state } = makeDb({
      check: {
        ...baseCheck,
        fail_threshold: 1,
      },
      checkRuns: [makeCheckRun()],
    });
    const result = buildCheckResult({
      state: "fail",
      statusCode: 500,
      latencyMs: null,
      error: "HTTP 500",
      reason: "http_status",
      checkedAt: "2026-06-22T00:11:00.000Z",
    });

    await persistCheckResult(db, state.check, result, null, state.checkRuns[0]!);
    await persistCheckResult(db, state.check, result, null, state.checkRuns[0]!);

    expect(state.incidents).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.results).toHaveLength(1);
  });

  it("does not duplicate incident resolve on the same attempt", async () => {
    const { db, state } = makeDb({
      check: {
        ...baseCheck,
        last_state: "fail",
        consecutive_failures: 2,
        first_failure_at: "2026-06-22T00:10:00.000Z",
      },
      incidents: [
        {
          id: 1,
          check_id: 1,
          started_at: "2026-06-22T00:10:00.000Z",
          resolved_at: null,
          start_reason: "http_status",
          end_reason: null,
          start_status_code: 500,
          end_status_code: null,
          failure_count: 1,
        },
      ],
      checkRuns: [makeCheckRun()],
    });
    const result = buildCheckResult({
      state: "ok",
      statusCode: 200,
      latencyMs: 20,
      error: null,
      reason: "http_ok",
      checkedAt: "2026-06-22T00:12:00.000Z",
    });

    await persistCheckResult(db, state.check, result, null, state.checkRuns[0]!);
    await persistCheckResult(db, state.check, result, null, state.checkRuns[0]!);

    expect(state.incidents[0]?.resolved_at).toBe("2026-06-22T00:12:00.000Z");
    expect(state.events).toHaveLength(1);
    expect(state.results).toHaveLength(1);
  });

  it("recovers from a batch failure without duplicating result or incident rows", async () => {
    const { db, state } = makeDb({
      batchFailuresRemaining: 1,
      check: {
        ...baseCheck,
        fail_threshold: 1,
      },
      checkRuns: [makeCheckRun()],
    });
    const result = buildCheckResult({
      state: "fail",
      statusCode: 500,
      latencyMs: null,
      error: "HTTP 500",
      reason: "http_status",
      checkedAt: "2026-06-22T00:11:00.000Z",
    });

    await expect(persistCheckResult(db, state.check, result, null, state.checkRuns[0]!)).rejects.toThrow("batch failed");
    expect(state.results).toHaveLength(1);
    expect(state.incidents).toHaveLength(1);

    await expect(persistCheckResult(db, state.check, result, null, state.checkRuns[0]!)).resolves.toMatchObject({
      kind: "incident-opened",
      nextState: "fail",
    });

    expect(state.results).toHaveLength(1);
    expect(state.incidents).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    expect(state.incidents[0]?.failure_count).toBe(1);
    expect(state.checkRuns[0]?.finished_at).toBe("2026-06-22T00:11:00.000Z");
  });
});
