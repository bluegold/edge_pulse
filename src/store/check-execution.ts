import type { D1Database } from "../lib/cloudflare";
import {
  buildCheckResult,
  evaluateTransition,
  type CheckRunClaim,
  type CheckJob,
  type CheckResult,
  type CheckRow,
  type CheckRunRow,
  type CheckRunResultState,
  type TransitionChange,
} from "../lib/checks";
import type { CertProbeResponse } from "../lib/cert-probe";

const CHECK_RUN_LEASE_MS = 5 * 60_000;

const addMilliseconds = (iso: string, ms: number): string => {
  return new Date(new Date(iso).getTime() + ms).toISOString();
};

export const getCheckForExecution = async (db: D1Database, id: number): Promise<CheckRow | null> => {
  return db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
};

export const claimScheduledCheckRun = async (db: D1Database, job: CheckJob, now: string): Promise<boolean> => {
  const inserted = await db
    .prepare(
      `
      INSERT OR IGNORE INTO check_runs (
        check_id, attempt_id, scheduled_at, started_at, lease_until, finished_at, result_state, skip_reason,
        dispatched_at, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
      RETURNING id
    `,
    )
    .bind(job.checkId, job.attemptId, job.scheduledAt, now, now)
    .first<{ id: number }>();

  return Boolean(inserted);
};

export const ensureCheckRunForExecution = async (db: D1Database, job: CheckJob, now: string): Promise<CheckRunClaim> => {
  const leaseUntil = addMilliseconds(now, CHECK_RUN_LEASE_MS);
  const claimed = await db
    .prepare(
      `
      UPDATE check_runs
      SET started_at = COALESCE(started_at, ?),
          lease_until = ?,
          updated_at = ?
      WHERE attempt_id = ?
        AND finished_at IS NULL
        AND (
          lease_until IS NULL
          OR lease_until <= ?
        )
      RETURNING *
    `,
    )
    .bind(now, leaseUntil, now, job.attemptId, now)
    .first<CheckRunRow>();

  if (claimed) {
    return { kind: "claimed", run: claimed };
  }

  const run = await db
    .prepare(
      `
      SELECT *
      FROM check_runs
      WHERE attempt_id = ?
      LIMIT 1
    `,
    )
    .bind(job.attemptId)
    .first<CheckRunRow>();

  if (!run) {
    return { kind: "missing" };
  }

  if (run.finished_at) {
    return { kind: "finished" };
  }

  if (run.lease_until && run.lease_until > now) {
    return { kind: "leased", leaseUntil: run.lease_until };
  }

  return { kind: "missing" };
};

export const loadUndispatchedCheckRuns = async (db: D1Database, now: string): Promise<CheckRunRow[]> => {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM check_runs
      WHERE dispatched_at IS NULL
        AND finished_at IS NULL
        AND scheduled_at <= ?
      ORDER BY scheduled_at ASC, id ASC
      LIMIT 500
    `,
    )
    .bind(now)
    .all<CheckRunRow>();

  return result.results;
};

export const loadStaleCheckRuns = async (db: D1Database, now: string): Promise<CheckRunRow[]> => {
  const result = await db
    .prepare(
      `
      SELECT *
      FROM check_runs
      WHERE finished_at IS NULL
        AND dispatched_at IS NOT NULL
        AND lease_until IS NOT NULL
        AND lease_until <= ?
      ORDER BY lease_until ASC, id ASC
      LIMIT 500
    `,
    )
    .bind(now)
    .all<CheckRunRow>();

  return result.results;
};

export const markCheckRunDispatched = async (db: D1Database, attemptId: string, now: string): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE check_runs
      SET dispatched_at = ?, updated_at = ?
      WHERE attempt_id = ?
        AND dispatched_at IS NULL
    `,
    )
    .bind(now, now, attemptId)
    .run();
};

export const clearCheckRunLease = async (db: D1Database, attemptId: string, now: string): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE check_runs
      SET lease_until = NULL, updated_at = ?
      WHERE attempt_id = ?
        AND finished_at IS NULL
    `,
    )
    .bind(now, attemptId)
    .run();
};

export const finishCheckRunSkipped = async (db: D1Database, run: CheckRunRow, now: string, skipReason: string): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE check_runs
      SET finished_at = ?, result_state = 'skipped', skip_reason = ?, lease_until = NULL, updated_at = ?
      WHERE id = ?
        AND finished_at IS NULL
    `,
    )
    .bind(now, skipReason, now, run.id)
    .run();
};

export const getLatestRecoveryAt = async (db: D1Database, check: CheckRow): Promise<string | null> => {
  if (!(check.last_state === "ok" && check.tls_last_error)) {
    return null;
  }

  const row = await db
    .prepare(
      `
      SELECT occurred_at
      FROM status_events
      WHERE check_id = ?
        AND from_state = 'fail'
        AND to_state = 'ok'
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1
    `,
    )
    .bind(check.id)
    .first<{ occurred_at: string }>();

  return row?.occurred_at ?? null;
};

export const persistCheckResult = async (
  db: D1Database,
  check: CheckRow,
  result: ReturnType<typeof buildCheckResult>,
  certificate: CertProbeResponse | null,
  run: CheckRunRow,
): Promise<TransitionChange> => {
  if (run.finished_at) {
    return { kind: "none", nextState: check.last_state };
  }

  const evaluated = evaluateTransition(check, result);
  const nextCheck = evaluated.nextCheck;

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO check_results (
        check_id, check_run_id, state, status_code, latency_ms, error, x_runtime_ms, server_timing_json, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(
      check.id,
      run.id,
      result.state,
      result.statusCode,
      result.latencyMs,
      result.error,
      result.xRuntimeMs ?? null,
      result.serverTiming ? JSON.stringify(result.serverTiming) : null,
      result.checkedAt,
    )
    .run();

  if (evaluated.transition.kind === "incident-opened") {
    await db
      .prepare(
        `
        INSERT OR IGNORE INTO incidents (
          check_id, started_at, resolved_at, start_reason, end_reason, start_status_code, end_status_code,
          failure_count, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, NULL, ?, NULL, 1, ?, ?)
      `,
      )
      .bind(check.id, evaluated.transition.startedAt, result.reason, result.statusCode, result.checkedAt, result.checkedAt)
      .run();
  }

  const unresolvedIncident = await db
    .prepare(
      `
      SELECT id, started_at
      FROM incidents
      WHERE check_id = ?
        AND resolved_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `,
    )
    .bind(check.id)
    .first<{ id: number; started_at: string }>();

  const incidentStartedAt =
    evaluated.transition.kind === "incident-opened" ? evaluated.transition.startedAt : unresolvedIncident?.started_at ?? result.checkedAt;

  const failureCountRow = await db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM check_results
      WHERE check_id = ?
        AND state = 'fail'
        AND checked_at >= ?
    `,
    )
    .bind(check.id, incidentStartedAt)
    .first<{ count: number }>();
  const failureCount = Number(failureCountRow?.count ?? 0);

  const statements = [
    db
      .prepare(
        `
        UPDATE checks
        SET last_checked_at = ?, last_state = ?, last_status_code = ?, last_latency_ms = ?, last_error = ?,
            consecutive_failures = ?, consecutive_successes = ?, first_failure_at = ?, first_success_at = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .bind(
        nextCheck.last_checked_at,
        nextCheck.last_state,
        nextCheck.last_status_code,
        nextCheck.last_latency_ms,
        nextCheck.last_error,
        nextCheck.consecutive_failures,
        nextCheck.consecutive_successes,
        nextCheck.first_failure_at,
        nextCheck.first_success_at,
        nextCheck.updated_at,
        nextCheck.id,
      ),
  ];

  if (certificate) {
    statements[0] = db
      .prepare(
        `
        UPDATE checks
        SET last_checked_at = ?, last_state = ?, last_status_code = ?, last_latency_ms = ?, last_error = ?,
            consecutive_failures = ?, consecutive_successes = ?, first_failure_at = ?, first_success_at = ?,
            tls_last_checked_at = COALESCE(?, tls_last_checked_at),
            tls_last_error = ?,
            tls_subject = COALESCE(?, tls_subject),
            tls_issuer = COALESCE(?, tls_issuer),
            tls_public_key_class = COALESCE(?, tls_public_key_class),
            tls_valid_from = COALESCE(?, tls_valid_from),
            tls_valid_to = COALESCE(?, tls_valid_to),
            tls_days_remaining = COALESCE(?, tls_days_remaining),
            tls_dns_names = COALESCE(?, tls_dns_names),
            updated_at = ?
        WHERE id = ?
      `,
      )
      .bind(
        nextCheck.last_checked_at,
        nextCheck.last_state,
        nextCheck.last_status_code,
        nextCheck.last_latency_ms,
        nextCheck.last_error,
        nextCheck.consecutive_failures,
        nextCheck.consecutive_successes,
        nextCheck.first_failure_at,
        nextCheck.first_success_at,
        result.checkedAt,
        certificate.error,
        certificate.subject,
        certificate.issuer,
        certificate.class,
        certificate.validFrom,
        certificate.validTo,
        certificate.daysRemaining,
        certificate.dnsNames ? JSON.stringify(certificate.dnsNames) : null,
        nextCheck.updated_at,
        nextCheck.id,
      );
  }

  if (nextCheck.last_state === "fail") {
    if (unresolvedIncident) {
      statements.push(
        db
          .prepare(
            `
            UPDATE incidents
            SET failure_count = ?, updated_at = ?
            WHERE id = ? AND resolved_at IS NULL
          `,
          )
          .bind(failureCount, result.checkedAt, unresolvedIncident.id),
      );
    }
  }

  if (evaluated.transition.kind === "incident-opened") {
    statements.push(
      db
        .prepare(
          `
          INSERT OR IGNORE INTO status_events (
            check_id, check_run_id, from_state, to_state, reason, status_code, error, latency_ms, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          check.id,
          run.id,
          check.last_state,
          evaluated.transition.nextState,
          result.reason,
          result.statusCode,
          result.error,
          result.latencyMs,
          result.checkedAt,
        ),
    );
  }

  if (evaluated.transition.kind === "incident-resolved" && unresolvedIncident) {
    statements.push(
      db
        .prepare(
          `
          INSERT OR IGNORE INTO status_events (
            check_id, check_run_id, from_state, to_state, reason, status_code, error, latency_ms, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          check.id,
          run.id,
          check.last_state,
          evaluated.transition.nextState,
          result.reason,
          result.statusCode,
          result.error,
          result.latencyMs,
          result.checkedAt,
        ),
    );
  }

  if (evaluated.transition.kind === "incident-resolved" && unresolvedIncident) {
    statements.push(
      db
        .prepare(
          `
          UPDATE incidents
          SET resolved_at = ?, end_reason = ?, end_status_code = ?, updated_at = ?
          WHERE id = ? AND resolved_at IS NULL
        `,
        )
        .bind(evaluated.transition.resolvedAt, result.reason, result.statusCode, result.checkedAt, unresolvedIncident.id),
    );
  }

  statements.push(
    db
      .prepare(
        `
        UPDATE check_runs
        SET finished_at = ?, result_state = ?, skip_reason = NULL, lease_until = NULL, updated_at = ?
        WHERE id = ?
          AND finished_at IS NULL
      `,
      )
      .bind(result.checkedAt, result.state, result.checkedAt, run.id),
  );

  await db.batch(statements);

  return evaluated.transition;
};

export const finishCheckRun = async (
  db: D1Database,
  run: CheckRunRow,
  now: string,
  resultState: CheckRunResultState,
  skipReason: string | null = null,
): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE check_runs
      SET finished_at = ?, result_state = ?, skip_reason = ?, lease_until = NULL, updated_at = ?
      WHERE id = ?
        AND finished_at IS NULL
    `,
    )
    .bind(now, resultState, skipReason, now, run.id)
    .run();
};

export type { CheckResult };
