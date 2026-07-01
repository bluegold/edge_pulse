import { Hono } from "hono";
import type { Bindings } from "../lib/bindings";
import { validateCheckInput, type CheckInput, type CheckRow } from "../lib/checks";
import { loadChecksPageData } from "../lib/checks-page-data";
import { loadDashboardData } from "../lib/dashboard-data";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { renderChecksPage, renderChecksShell } from "../views/checks-page.tsx";

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

const readCheckInputFromRequest = async (request: Request): Promise<CheckInput | null> => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return readJsonCheckInput(request);
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return readFormCheckInput(request);
  }

  if (!contentType) {
    return readJsonCheckInput(request);
  }

  return null;
};

const CERT_EXPIRY_THRESHOLD_DAYS = 30;

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

const getCheckById = async (db: Bindings["pulse-db"], id: number): Promise<CheckRow | null> => {
  return db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
};

const insertCheck = async (db: Bindings["pulse-db"], input: CheckInput, now: string): Promise<number> => {
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

const updateCheck = async (db: Bindings["pulse-db"], id: number, input: CheckInput, now: string): Promise<void> => {
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

const renderChecksFromDb = async (
  env: Bindings,
  page = 1,
  editId: number | null = null,
  highlightId: number | null = null,
): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId);
  return renderChecksPage(data);
};

const renderChecksShellFromDb = async (
  env: Bindings,
  page = 1,
  editId: number | null = null,
  highlightId: number | null = null,
): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId);
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
  const input = await readCheckInputFromRequest(request);
  if (!input) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Unsupported content type</main>`,
      415,
    );
  }
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
  const input = await readCheckInputFromRequest(request);
  if (!input) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Unsupported content type</main>`,
      415,
    );
  }
  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${validation.error}</main>`,
      400,
    );
  }

  const now = new Date().toISOString();
  await updateCheck(env["pulse-db"], id, input, now);
  return isHxRequest(request)
    ? renderChecksShellFromDb(env, page, null, id)
    : renderChecksFromDb(env, page, null, id);
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
  const input = await readCheckInputFromRequest(request);
  if (!input) {
    return respondJson({ error: "unsupported_media_type" }, 415);
  }
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
  const input = await readCheckInputFromRequest(request);
  if (!input) {
    return respondJson({ error: "unsupported_media_type" }, 415);
  }
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

export const app = new Hono<{ Bindings: Bindings }>();

export {
  getCheckById,
  handleApiCreateCheck,
  handleApiListChecks,
  handleApiUpdateCheck,
  handleCreateCheck,
  handleUpdateCheck,
  isHxRequest,
  requireApiToken,
  renderChecksFromDb,
  renderChecksShellFromDb,
  renderDashboardShellFromDb,
  renderFromDb,
};
