import type { D1Database } from "../lib/cloudflare";
import { buildCheckResult, evaluateTransition, type CheckResult, type CheckRow } from "../lib/checks";
import type { CertProbeResponse } from "../lib/cert-probe";

export const getCheckForExecution = async (db: D1Database, id: number): Promise<CheckRow | null> => {
  return db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
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
): Promise<void> => {
  const evaluated = evaluateTransition(check, result);
  const nextCheck = evaluated.nextCheck;
  const unresolvedIncident = await db
    .prepare(
      `
      SELECT id
      FROM incidents
      WHERE check_id = ?
        AND resolved_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `,
    )
    .bind(check.id)
    .first<{ id: number }>();
  const incidentStartedAt =
    evaluated.transition.kind === "incident-opened" ? evaluated.transition.startedAt : nextCheck.first_failure_at ?? result.checkedAt;
  const shouldOpenIncident = nextCheck.last_state === "fail" && !unresolvedIncident;

  const statements = [
    db
      .prepare(
        `
        INSERT INTO check_results (
          check_id, state, status_code, latency_ms, error, x_runtime_ms, server_timing_json, checked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(
        check.id,
        result.state,
        result.statusCode,
        result.latencyMs,
        result.error,
        result.xRuntimeMs ?? null,
        result.serverTiming ? JSON.stringify(result.serverTiming) : null,
        result.checkedAt,
      ),
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
    statements[1] = db
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

  if (shouldOpenIncident) {
    statements.push(
      db
        .prepare(
          `
          INSERT INTO incidents (
            check_id, started_at, resolved_at, start_reason, end_reason, start_status_code, end_status_code,
            failure_count, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, NULL, ?, NULL, 1, ?, ?)
        `,
        )
        .bind(check.id, incidentStartedAt, result.reason, result.statusCode, result.checkedAt, result.checkedAt),
    );
  } else if (nextCheck.last_state === "fail") {
    if (unresolvedIncident) {
      statements.push(
        db
          .prepare(
            `
            UPDATE incidents
            SET failure_count = failure_count + 1, updated_at = ?
            WHERE id = ?
          `,
          )
          .bind(result.checkedAt, unresolvedIncident.id),
      );
    }
  }

  if (evaluated.transition.kind === "incident-resolved" && unresolvedIncident) {
    statements.push(
      db
        .prepare(
          `
          UPDATE incidents
          SET resolved_at = ?, end_reason = ?, end_status_code = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .bind(evaluated.transition.resolvedAt, result.reason, result.statusCode, result.checkedAt, unresolvedIncident.id),
    );
  }

  if (evaluated.transition.kind === "incident-opened" || evaluated.transition.kind === "incident-resolved") {
    statements.push(
      db
        .prepare(
          `
          INSERT INTO status_events (
            check_id, from_state, to_state, reason, status_code, error, latency_ms, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          check.id,
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

  await db.batch(statements);
};
export type { CheckResult };
