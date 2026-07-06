import type { Bindings } from "../lib/bindings";
import {
  buildCheckResult,
  classifyCheckFailureReason,
  scheduleNextCheckAt,
  validateMonitorUrl,
  isMaintenanceWindowActive,
  type CheckJob,
} from "../lib/checks";
import { parseServerTimingHeader, resolveXRuntimeMs } from "../lib/http-timing";
import { shouldProbeCertificateSnapshot } from "../lib/cert-probe";
import type { ScheduledController } from "../lib/cloudflare";
import {
  getCheckForExecution,
  getLatestRecoveryAt,
  persistCheckResult,
} from "../store/check-execution";
import { describeCertificateAlert, probeCertificateSnapshot } from "./certificate-check";
import { dispatchNotifications } from "./notifications";
import type { ExecutionContext } from "../lib/cloudflare";

const CHECK_USER_AGENT = "edge-pulse-check/1.0";

export const runCheck = async (env: Bindings, job: CheckJob, ctx?: ExecutionContext): Promise<void> => {
  const check = await getCheckForExecution(env["pulse-db"], job.checkId);
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

  const latestRecovery = await getLatestRecoveryAt(env["pulse-db"], check);

  const certificatePromise = shouldProbeCertificateSnapshot(check, checkedAt, latestRecovery)
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
      headers: {
        "user-agent": CHECK_USER_AGENT,
      },
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
  const serverTiming = parseServerTimingHeader(response?.headers.get("server-timing"));

  const result = buildCheckResult({
    state: shouldFail ? "fail" : "ok",
    statusCode: response?.status ?? null,
    latencyMs: response ? latencyMs : null,
    error: resultError,
    reason: resultReason,
    checkedAt,
    serverTiming,
    xRuntimeMs: resolveXRuntimeMs(response?.headers.get("x-runtime"), serverTiming),
  });

  const transition = await persistCheckResult(env["pulse-db"], check, result, certificate);
  if (!transition || transition.kind === "none") return;
  if (isMaintenanceWindowActive(check.maintenance_enabled)) return;

  const notification = dispatchNotifications(env, {
    check,
    result,
    transition,
  });

  if (ctx) {
    ctx.waitUntil(
      notification.catch((error) => {
        console.error("notification dispatch failed", error);
      }),
    );
    return;
  }

  await notification.catch((error) => {
    console.error("notification dispatch failed", error);
  });
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
