import {
  buildCheckResult,
  scheduleNextCheckAt,
  validateMonitorUrl,
  isMaintenanceWindowActive,
  type CheckJob,
} from "../lib/checks";
import { parseServerTimingHeader, resolveXRuntimeMs } from "../lib/http-timing";
import { shouldProbeCertificateSnapshot } from "../lib/cert-probe";
import {
  claimScheduledCheckRun,
  ensureCheckRunForExecution,
  getCheckForExecution,
  getLatestRecoveryAt,
  loadUndispatchedCheckRuns,
  loadStaleCheckRuns,
  markCheckRunDispatched,
  clearCheckRunLease,
  finishCheckRun,
  persistCheckResult,
} from "../store/check-execution";
import { describeCertificateAlert, probeCertificateSnapshot } from "./certificate-check";
import { dispatchNotifications } from "./notifications";
import { determineResultState, performHttpCheck } from "./http-check";

const dispatchCheckRun = async (
  env: Env,
  checkId: number,
  intervalMinutes: number,
  job: CheckJob,
  now: string,
): Promise<void> => {
  await env["pulse-queue"].send(job);
  await markCheckRunDispatched(env["pulse-db"], job.attemptId, now);

  const nextCheckAt = scheduleNextCheckAt(now, intervalMinutes);
  await env["pulse-db"]
    .prepare(
      `
      UPDATE checks
      SET last_enqueued_at = ?, next_check_at = ?, updated_at = ?
      WHERE id = ?
    `,
    )
    .bind(now, nextCheckAt, now, checkId)
    .run();
};

const requeueStaleCheckRun = async (env: Env, run: CheckJob, now: string): Promise<void> => {
  await env["pulse-queue"].send(run);
  await clearCheckRunLease(env["pulse-db"], run.attemptId, now);
};

export const runCheck = async (env: Env, job: CheckJob, ctx?: ExecutionContext): Promise<void> => {
  const claim = await ensureCheckRunForExecution(env["pulse-db"], job, new Date().toISOString());
  if (claim.kind === "finished" || claim.kind === "missing") return;
  if (claim.kind === "leased") {
    throw new Error("check run is leased");
  }
  const { run } = claim;

  const check = await getCheckForExecution(env["pulse-db"], job.checkId);
  if (!check) {
    await finishCheckRun(env["pulse-db"], run, new Date().toISOString(), "skipped", "check_not_found");
    return;
  }
  if (!check.enabled) {
    await finishCheckRun(env["pulse-db"], run, new Date().toISOString(), "skipped", "check_disabled");
    return;
  }

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
    await persistCheckResult(env["pulse-db"], check, result, null, run);
    return;
  }

  const latestRecovery = await getLatestRecoveryAt(env["pulse-db"], check);
  const certificatePromise = shouldProbeCertificateSnapshot(check, checkedAt, latestRecovery)
    ? probeCertificateSnapshot(env, check)
    : Promise.resolve(null);

  const { response, error, latencyMs } = await performHttpCheck(validation.url.toString(), check.method, check.timeout_ms);
  const certificate = await certificatePromise;

  const inRange = response ? response.status >= check.expected_status_min && response.status <= check.expected_status_max : false;
  const certificateAlert = certificate ? describeCertificateAlert(certificate) : null;
  
  const { shouldFail, resultReason, resultError } = determineResultState(response, error, inRange, certificateAlert);
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

  const transition = await persistCheckResult(env["pulse-db"], check, result, certificate, run);
  if (!transition || transition.kind === "none" || transition.kind === "state-initialized") return;
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

const handleScheduled = async (controller: ScheduledController, env: Env): Promise<void> => {
  const now = new Date(controller.scheduledTime).toISOString();
  const stale = await loadStaleCheckRuns(env["pulse-db"], now);
  for (const run of stale) {
    const check = await getCheckForExecution(env["pulse-db"], run.check_id);
    if (!check) {
      await finishCheckRun(env["pulse-db"], run, now, "skipped", "check_not_found");
      continue;
    }
    if (!check.enabled) {
      await finishCheckRun(env["pulse-db"], run, now, "skipped", "check_disabled");
      continue;
    }

    await requeueStaleCheckRun(
      env,
      {
        checkId: run.check_id,
        scheduledAt: run.scheduled_at,
        attemptId: run.attempt_id,
      },
      now,
    );
  }

  const undispatched = await loadUndispatchedCheckRuns(env["pulse-db"], now);
  for (const run of undispatched) {
    const check = await getCheckForExecution(env["pulse-db"], run.check_id);
    if (!check) {
      await finishCheckRun(env["pulse-db"], run, now, "skipped", "check_not_found");
      continue;
    }
    if (!check.enabled) {
      await finishCheckRun(env["pulse-db"], run, now, "skipped", "check_disabled");
      continue;
    }

    await dispatchCheckRun(
      env,
      check.id,
      check.interval_minutes,
      {
        checkId: run.check_id,
        scheduledAt: run.scheduled_at,
        attemptId: run.attempt_id,
      },
      now,
    );
  }

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
    const attemptId = crypto.randomUUID();
    const claimed = await claimScheduledCheckRun(env["pulse-db"], {
      checkId: check.id,
      scheduledAt: now,
      attemptId,
    }, now);

    if (claimed) {
      await dispatchCheckRun(
        env,
        check.id,
        check.interval_minutes,
        {
          checkId: check.id,
          scheduledAt: now,
          attemptId,
        },
        now,
      );
    }
  }
};

export { handleScheduled };
