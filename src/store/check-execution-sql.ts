import type { CertProbeResponse } from "../lib/cert-probe";
import type { CheckRow, CheckRunRow, TransitionChange, CheckResult } from "../lib/checks";
import type { Database } from "../lib/database";

export const buildUpdateCheckStatement = (db: Database, nextCheck: CheckRow, certificate: CertProbeResponse | null, checkedAt: string) => {
  if (certificate) {
    return db.prepare(`
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
    `).bind(
      nextCheck.last_checked_at, nextCheck.last_state, nextCheck.last_status_code, nextCheck.last_latency_ms, nextCheck.last_error,
      nextCheck.consecutive_failures, nextCheck.consecutive_successes, nextCheck.first_failure_at, nextCheck.first_success_at,
      checkedAt, certificate.error, certificate.subject, certificate.issuer, certificate.class, certificate.validFrom, certificate.validTo,
      certificate.daysRemaining, certificate.dnsNames ? JSON.stringify(certificate.dnsNames) : null, nextCheck.updated_at, nextCheck.id
    );
  }

  return db.prepare(`
    UPDATE checks
    SET last_checked_at = ?, last_state = ?, last_status_code = ?, last_latency_ms = ?, last_error = ?,
        consecutive_failures = ?, consecutive_successes = ?, first_failure_at = ?, first_success_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    nextCheck.last_checked_at, nextCheck.last_state, nextCheck.last_status_code, nextCheck.last_latency_ms, nextCheck.last_error,
    nextCheck.consecutive_failures, nextCheck.consecutive_successes, nextCheck.first_failure_at, nextCheck.first_success_at,
    nextCheck.updated_at, nextCheck.id
  );
};

export const buildStatusEventStatement = (
  db: Database, 
  check: CheckRow, 
  run: CheckRunRow, 
  result: CheckResult, 
  transition: TransitionChange
) => {
  return db.prepare(`
    INSERT OR IGNORE INTO status_events (
      check_id, check_run_id, from_state, to_state, reason, status_code, error, latency_ms, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    check.id, run.id, check.last_state, transition.kind !== "none" ? transition.nextState : check.last_state, result.reason, result.statusCode, result.error, result.latencyMs, result.checkedAt
  );
};
