import type { Bindings } from "../lib/bindings";
import { validateCheckInput, type CheckInput, type CheckRow } from "../lib/checks";
import { loadChecksPageData } from "../lib/checks-page-data";
import { renderChecksPage, renderChecksShell } from "../views/checks-page.tsx";
import { isHxRequest, readCheckInputFromRequest, respondHtml, respondJson } from "../http/shared";

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

const renderChecksData = async (env: Bindings, page: number, editId: number | null, highlightId: number | null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId);
  return renderChecksPage(data);
};

const renderChecksShellData = async (env: Bindings, page: number, editId: number | null, highlightId: number | null): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId);
  return respondHtml(`<main id="content">${renderChecksShell(data)}</main>`);
};

export const handleChecksRequest = async (
  request: Request,
  env: Bindings,
  page = 1,
  editId: number | null = null,
  highlightId: number | null = null,
): Promise<Response> => {
  return isHxRequest(request)
    ? renderChecksShellData(env, page, editId, highlightId)
    : renderChecksData(env, page, editId, highlightId);
};

export const handleCreateCheck = async (request: Request, env: Bindings): Promise<Response> => {
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
  return isHxRequest(request) ? renderChecksShellData(env, page, null, null) : renderChecksData(env, page, null, null);
};

export const handleUpdateCheck = async (request: Request, env: Bindings, id: number): Promise<Response> => {
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
    ? renderChecksShellData(env, page, null, id)
    : renderChecksData(env, page, null, id);
};

export const handleApiListChecks = async (env: Bindings, request: Request): Promise<Response> => {
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

export const handleApiCreateCheck = async (env: Bindings, request: Request): Promise<Response> => {
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

export const handleApiUpdateCheck = async (env: Bindings, id: number, request: Request): Promise<Response> => {
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

export const handleApiGetCheck = async (env: Bindings, id: number): Promise<Response> => {
  const check = await getCheckById(env["pulse-db"], id);
  if (!check) {
    return respondJson({ error: "not_found" }, 404);
  }
  return respondJson({ check });
};
