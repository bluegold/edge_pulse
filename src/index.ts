import { Hono } from "hono";
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
import { renderDashboardPage, renderDashboardShell } from "./views/dashboard-page.tsx";
import { renderChecksPage, renderChecksShell } from "./views/checks-page.tsx";

type Bindings = {
  "pulse-db": D1Database;
  "pulse-queue": { send(message: CheckJob): Promise<void> };
  ADMIN_API_TOKEN: string;
};

const respondHtml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const respondJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const parseEnabled = (value: unknown): boolean => {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
};

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readCheckInput = (input: Record<string, unknown>): CheckInput => ({
  name: String(input.name ?? ""),
  url: String(input.url ?? ""),
  method: "GET",
  enabled: parseEnabled(input.enabled),
  expectedStatusMin: parseNumber(input.expected_status_min, 200),
  expectedStatusMax: parseNumber(input.expected_status_max, 399),
  timeoutMs: parseNumber(input.timeout_ms, 10_000),
  intervalMinutes: parseNumber(input.interval_minutes, 5),
  failThreshold: parseNumber(input.fail_threshold, 2),
  recoveryThreshold: parseNumber(input.recovery_threshold, 1),
});

const readFormCheckInput = async (request: Request): Promise<CheckInput> => {
  const form = await request.formData();
  const input: Record<string, unknown> = {};
  form.forEach((value, key) => {
    input[key] = value;
  });
  return readCheckInput(input);
};

const readJsonCheckInput = async (request: Request): Promise<CheckInput> => {
  const body = (await request.json()) as Record<string, unknown>;
  return readCheckInput(body);
};

const timingSafeEquals = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
};

const insertCheck = async (db: D1Database, input: CheckInput, now: string): Promise<number> => {
  const inserted = await db
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
      RETURNING id
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
    .first<{ id: number }>();

  return inserted?.id ?? 0;
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

const requireApiToken = async (request: Request, env: Bindings): Promise<Response | null> => {
  const expected = env.ADMIN_API_TOKEN.trim();
  if (!expected) {
    return respondJson({ error: "API token is not configured" }, 500);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length);
  if (!timingSafeEquals(token, expected)) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  return null;
};

const renderFromDb = async (env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return renderDashboardPage(data);
};

const renderChecksFromDb = async (env: Bindings, page = 1, editId: number | null = null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId);
  return renderChecksPage(data);
};

const renderChecksShellFromDb = async (env: Bindings, page = 1, editId: number | null = null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId);
  return respondHtml(`<main id="content">${renderChecksShell(data)}</main>`);
};

const renderDashboardShellFromDb = async (env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return respondHtml(`<main id="content">${renderDashboardShell(data)}</main>`);
};

const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";

const handleCreateCheck = async (request: Request, env: Bindings): Promise<Response> => {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const input = await readFormCheckInput(request);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${validation.error}</main>`,
      400,
    );
  }

  const now = new Date().toISOString();
  await insertCheck(env["pulse-db"], input, now);
  return isHxRequest(request) ? renderChecksShellFromDb(env, page) : renderChecksFromDb(env, page);
};

const handleUpdateCheck = async (request: Request, env: Bindings, id: number): Promise<Response> => {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const input = await readFormCheckInput(request);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${validation.error}</main>`,
      400,
    );
  }

  const now = new Date().toISOString();
  await updateCheck(env["pulse-db"], id, input, now);
  return isHxRequest(request) ? renderChecksShellFromDb(env, page) : renderChecksFromDb(env, page);
};

const handleApiListChecks = async (env: Bindings, request: Request): Promise<Response> => {
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const data = await loadChecksPageData(env["pulse-db"], page);
  return respondJson({
    checks: data.checks,
    page: data.page,
    pageSize: data.pageSize,
    totalChecks: data.totalChecks,
    totalPages: data.totalPages,
  });
};

const handleApiCreateCheck = async (env: Bindings, request: Request): Promise<Response> => {
  const input = await readJsonCheckInput(request);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondJson({ error: validation.error }, 400);
  }

  const now = new Date().toISOString();
  const id = await insertCheck(env["pulse-db"], input, now);
  const check = await getCheckById(env["pulse-db"], id);
  return respondJson({ check }, 201);
};

const handleApiUpdateCheck = async (env: Bindings, id: number, request: Request): Promise<Response> => {
  const input = await readJsonCheckInput(request);
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondJson({ error: validation.error }, 400);
  }

  const now = new Date().toISOString();
  await updateCheck(env["pulse-db"], id, input, now);
  const check = await getCheckById(env["pulse-db"], id);
  if (!check) {
    return respondJson({ error: "not_found" }, 404);
  }

  return respondJson({ check });
};

const runCheck = async (env: Bindings, job: CheckJob): Promise<void> => {
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

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (c, next) => {
  const tokenCheck = await requireApiToken(c.req.raw, c.env);
  if (tokenCheck) return tokenCheck;
  await next();
});

app.get("/", async (c) => (isHxRequest(c.req.raw) ? renderDashboardShellFromDb(c.env) : renderFromDb(c.env)));
app.get("/checks", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const editId = c.req.query("edit");
  return isHxRequest(c.req.raw)
    ? renderChecksShellFromDb(c.env, page, editId ? Number(editId) : null)
    : renderChecksFromDb(c.env, page, editId ? Number(editId) : null);
});
app.post("/checks", async (c) => handleCreateCheck(c.req.raw, c.env));
app.post("/checks/:id", async (c) => handleUpdateCheck(c.req.raw, c.env, Number(c.req.param("id"))));
app.get("/api/checks", async (c) => handleApiListChecks(c.env, c.req.raw));
app.post("/api/checks", async (c) => handleApiCreateCheck(c.env, c.req.raw));
app.get("/api/checks/:id", async (c) => {
  const check = await getCheckById(c.env["pulse-db"], Number(c.req.param("id")));
  if (!check) return respondJson({ error: "not_found" }, 404);
  return respondJson({ check });
});
app.patch("/api/checks/:id", async (c) => handleApiUpdateCheck(c.env, Number(c.req.param("id")), c.req.raw));

export { app };

export default {
  fetch: app.fetch.bind(app),
  async scheduled(controller: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env);
  },
  async queue(batch: MessageBatch<CheckJob>, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    const message = batch.messages[0];
    if (!message?.body) return;
    await runCheck(env, message.body);
  },
};
