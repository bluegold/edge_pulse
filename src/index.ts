import type { CheckJob, CheckInput, CheckRow } from "./lib/checks";
import {
  buildCheckResult,
  evaluateTransition,
  scheduleNextCheckAt,
  validateCheckInput,
  validateMonitorUrl,
} from "./lib/checks";
import { loadChecksPageData } from "./lib/checks-page-data";
import type { D1Database, ExecutionContext, MessageBatch, ScheduledController } from "./lib/cloudflare";
import { loadDashboardData } from "./lib/dashboard-data";
import { renderDashboardPage } from "./views/dashboard-page";
import { renderChecksPage, renderChecksShell } from "./views/checks-page";

type Env = {
  "pulse-db": D1Database;
  "pulse-queue": { send(message: CheckJob): Promise<void> };
};

const respondHtml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const parseEnabled = (value: FormDataEntryValue | null): boolean => {
  return value === "1" || value === "true" || value === "on";
};

const parseNumber = (value: FormDataEntryValue | null, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readCheckInput = (form: FormData): CheckInput => ({
  name: String(form.get("name") ?? ""),
  url: String(form.get("url") ?? ""),
  method: "GET",
  enabled: parseEnabled(form.get("enabled")),
  expectedStatusMin: parseNumber(form.get("expected_status_min"), 200),
  expectedStatusMax: parseNumber(form.get("expected_status_max"), 399),
  timeoutMs: parseNumber(form.get("timeout_ms"), 10_000),
  intervalMinutes: parseNumber(form.get("interval_minutes"), 5),
  failThreshold: parseNumber(form.get("fail_threshold"), 2),
  recoveryThreshold: parseNumber(form.get("recovery_threshold"), 1),
});

const insertCheck = async (db: D1Database, input: CheckInput, now: string): Promise<void> => {
  await db
    .prepare(
      `
      INSERT INTO checks (
        name, url, method, enabled,
        expected_status_min, expected_status_max, timeout_ms, interval_minutes,
        next_check_at, last_enqueued_at, last_checked_at,
        last_state, last_status_code, last_latency_ms, last_error,
        fail_threshold, recovery_threshold, consecutive_failures, consecutive_successes,
        first_failure_at, first_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, ?, ?, 0, 0, NULL, NULL, ?, ?)
    `,
    )
    .bind(
      input.name.trim(),
      input.url.trim(),
      input.method,
      input.enabled ? 1 : 0,
      input.expectedStatusMin,
      input.expectedStatusMax,
      input.timeoutMs,
      input.intervalMinutes,
      input.failThreshold,
      input.recoveryThreshold,
      now,
      now,
    )
    .run();
};

const updateCheck = async (db: D1Database, id: number, input: CheckInput, now: string): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE checks
      SET name = ?, url = ?, method = ?, enabled = ?,
          expected_status_min = ?, expected_status_max = ?, timeout_ms = ?, interval_minutes = ?,
          fail_threshold = ?, recovery_threshold = ?, updated_at = ?
      WHERE id = ?
    `,
    )
    .bind(
      input.name.trim(),
      input.url.trim(),
      input.method,
      input.enabled ? 1 : 0,
      input.expectedStatusMin,
      input.expectedStatusMax,
      input.timeoutMs,
      input.intervalMinutes,
      input.failThreshold,
      input.recoveryThreshold,
      now,
      id,
    )
    .run();
};

const getCheckById = async (db: D1Database, id: number): Promise<CheckRow | null> => {
  return db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
};

const renderFromDb = async (env: Env): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return renderDashboardPage(data);
};

const renderChecksFromDb = async (env: Env, page = 1, editId: number | null = null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId);
  return renderChecksPage(data);
};

const renderChecksShellFromDb = async (env: Env, page = 1, editId: number | null = null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId);
  return respondHtml(renderChecksShell(data));
};

const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";

const handleCreateCheck = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const form = await request.formData();
  const input = readCheckInput(form);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondHtml(`<main id="checks-page-shell" class="p-6 text-sm text-rose-700">${validation.error}</main>`, 400);
  }

  const now = new Date().toISOString();
  await insertCheck(env["pulse-db"], input, now);
  return isHxRequest(request) ? renderChecksShellFromDb(env, page) : renderChecksFromDb(env, page);
};

const handleUpdateCheck = async (request: Request, env: Env, id: number): Promise<Response> => {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const form = await request.formData();
  const input = readCheckInput(form);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondHtml(`<main id="checks-page-shell" class="p-6 text-sm text-rose-700">${validation.error}</main>`, 400);
  }

  const now = new Date().toISOString();
  await updateCheck(env["pulse-db"], id, input, now);
  return isHxRequest(request) ? renderChecksShellFromDb(env, page) : renderChecksFromDb(env, page);
};

const runCheck = async (env: Env, job: CheckJob): Promise<void> => {
  const check = await getCheckById(env["pulse-db"], job.checkId);
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
    await persistCheckResult(env["pulse-db"], check, result);
    return;
  }

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

  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  const inRange = response
    ? response.status >= check.expected_status_min && response.status <= check.expected_status_max
    : false;

  const result = buildCheckResult({
    state: inRange ? "ok" : "fail",
    statusCode: response?.status ?? null,
    latencyMs: response ? latencyMs : null,
    error: response ? null : error ?? "request failed",
    reason: response ? (inRange ? "http_ok" : "http_status") : "fetch_error",
    checkedAt,
  });

  await persistCheckResult(env["pulse-db"], check, result);
};

const persistCheckResult = async (db: D1Database, check: CheckRow, result: ReturnType<typeof buildCheckResult>): Promise<void> => {
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

  if (nextCheck.last_state === "fail") {
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
    } else {
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
          .bind(
            check.id,
            evaluated.transition.kind === "incident-opened" ? evaluated.transition.startedAt : result.checkedAt,
            result.reason,
            result.statusCode,
            result.checkedAt,
            result.checkedAt,
          ),
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

const handleScheduled = async (controller: ScheduledController, env: Env): Promise<void> => {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return renderFromDb(env);
    }

    if (request.method === "GET" && url.pathname === "/checks") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const editId = url.searchParams.get("edit");
      return isHxRequest(request) ? renderChecksShellFromDb(env, page, editId ? Number(editId) : null) : renderChecksFromDb(env, page, editId ? Number(editId) : null);
    }

    if (request.method === "POST" && url.pathname === "/checks") {
      return handleCreateCheck(request, env);
    }

    if (request.method === "POST" && /^\/checks\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      return handleUpdateCheck(request, env, id);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env);
  },

  async queue(batch: MessageBatch<CheckJob>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const message = batch.messages[0];
    if (!message?.body) return;
    await runCheck(env, message.body);
  },
};
