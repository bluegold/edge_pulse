import { getContainer } from "@cloudflare/containers";
import type { Bindings } from "../lib/bindings";
import {
  buildCheckResult,
  classifyCheckFailureReason,
  evaluateTransition,
  isCertificateExpiringSoon,
  scheduleNextCheckAt,
  validateMonitorUrl,
  type CheckJob,
  type CheckRow,
} from "../lib/checks";
import { fetchCertificateSnapshot, shouldProbeCertificateSnapshot, type CertProbeResponse } from "../lib/cert-probe";
import type { D1Database, ScheduledController } from "../lib/cloudflare";

const CERT_EXPIRY_THRESHOLD_DAYS = 30;

const probeCertificateSnapshot = async (env: Bindings, check: CheckRow): Promise<CertProbeResponse | null> => {
  const parsed = new URL(check.url);
  if (parsed.protocol !== "https:") return null;

  const port = parsed.port ? Number(parsed.port) : 443;
  const serverName = parsed.hostname;
  const containerBinding = env.CertProbeContainer ?? env.CERT_PROBE_CONTAINER;
  if (!containerBinding) return null;

  const container = getContainer(containerBinding);
  return fetchCertificateSnapshot(container, parsed.hostname, port, serverName);
};

const describeCertificateAlert = (certificate: CertProbeResponse): { reason: string; error: string } | null => {
  if (certificate.daysRemaining === null) return null;
  if (certificate.daysRemaining < 0) {
    return {
      reason: "tls_expired",
      error: `certificate expired ${Math.abs(certificate.daysRemaining)} day${Math.abs(certificate.daysRemaining) === 1 ? "" : "s"} ago`,
    };
  }
  if (isCertificateExpiringSoon(certificate.daysRemaining, CERT_EXPIRY_THRESHOLD_DAYS)) {
    return {
      reason: "tls_expiring_soon",
      error: `certificate expires in ${certificate.daysRemaining} day${certificate.daysRemaining === 1 ? "" : "s"}`,
    };
  }
  return null;
};

const persistCheckResult = async (
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
        INSERT INTO check_results (check_id, state, status_code, latency_ms, error, checked_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(check.id, result.state, result.statusCode, result.latencyMs, result.error, result.checkedAt),
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

export const runCheck = async (env: Bindings, job: CheckJob): Promise<void> => {
  const check = await env["pulse-db"].prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(job.checkId).first<CheckRow>();
  if (!check || !check.enabled) return;

  const validation = validateMonitorUrl(check.url);
  const checkedAt = new Date().toISOString();
  if (!validation.ok) {
    const result = buildCheckResult({
      state: "fail",
      statusCode: null,
      latencyMs: null,
      error: validation.error,
      reason: "invalid_url",
      checkedAt,
    });
    await persistCheckResult(env["pulse-db"], check, result, null);
    return;
  }

  const latestRecovery =
    check.last_state === "ok" && check.tls_last_error
      ? await env["pulse-db"]
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
          .first<{ occurred_at: string }>()
      : null;

  const certificatePromise = shouldProbeCertificateSnapshot(check, checkedAt, latestRecovery?.occurred_at ?? null)
    ? probeCertificateSnapshot(env, check)
    : Promise.resolve(null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), check.timeout_ms);
  const started = performance.now();

  let response: Response | null = null;
  let error: string | null = null;
  try {
    response = await fetch(validation.url, {
      method: check.method,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    clearTimeout(timeout);
  }

  const certificate = await certificatePromise;
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  const inRange = response ? response.status >= check.expected_status_min && response.status <= check.expected_status_max : false;
  const certificateAlert = certificate ? describeCertificateAlert(certificate) : null;
  const certificateFailure = Boolean(certificateAlert);
  const shouldFail = certificateFailure || !inRange;
  const responseReason = response
    ? response.status === 526
      ? "tls_error"
      : inRange
        ? "http_ok"
        : "http_status"
    : classifyCheckFailureReason(null, error);
  const resultReason = certificateAlert?.reason ?? responseReason;
  const resultError =
    certificateAlert?.error ?? (response?.status === 526 ? "invalid SSL certificate" : response ? null : error ?? "request failed");

  const result = buildCheckResult({
    state: shouldFail ? "fail" : "ok",
    statusCode: response?.status ?? null,
    latencyMs: response ? latencyMs : null,
    error: resultError,
    reason: resultReason,
    checkedAt,
  });

  await persistCheckResult(env["pulse-db"], check, result, certificate);
};

const handleScheduled = async (controller: ScheduledController, env: Bindings): Promise<void> => {
  const now = new Date(controller.scheduledTime).toISOString();
  const due = await env["pulse-db"]
    .prepare(
      `
      SELECT id, interval_minutes
      FROM checks
      WHERE enabled = 1
        AND (next_check_at IS NULL OR next_check_at <= ?)
      ORDER BY next_check_at ASC, id ASC
      LIMIT 500
    `,
    )
    .bind(now)
    .all<{ id: number; interval_minutes: number }>();

  for (const check of due.results) {
    await env["pulse-queue"].send({
      checkId: check.id,
      scheduledAt: now,
      attemptId: crypto.randomUUID(),
    });

    const nextCheckAt = scheduleNextCheckAt(now, check.interval_minutes);
    await env["pulse-db"]
      .prepare(
        `
        UPDATE checks
        SET last_enqueued_at = ?, next_check_at = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .bind(now, nextCheckAt, now, check.id)
      .run();
  }
};

export { handleScheduled };
