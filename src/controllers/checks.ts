import type { Bindings } from "../lib/bindings";
import { validateCheckInput, type CheckInput } from "../lib/checks";
import { getCheckById, insertCheck, loadChecksPageData, updateCheck } from "../store/checks";
import { renderChecksPage, renderChecksShell } from "../views/checks-page.tsx";
import { isHxRequest, readCheckInputFromRequest, respondHtml, respondJson } from "../http/shared";

export const handleChecksRequest = async (
  request: Request,
  env: Bindings,
  page = 1,
  editId: number | null = null,
  highlightId: number | null = null,
): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId);
  return isHxRequest(request)
    ? respondHtml(`<main id="content">${renderChecksShell(data)}</main>`)
    : renderChecksPage(data);
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
  const data = await loadChecksPageData(env["pulse-db"], page, null, null);
  return isHxRequest(request) ? respondHtml(`<main id="content">${renderChecksShell(data)}</main>`) : renderChecksPage(data);
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
  const data = await loadChecksPageData(env["pulse-db"], page, null, id);
  return isHxRequest(request) ? respondHtml(`<main id="content">${renderChecksShell(data)}</main>`) : renderChecksPage(data);
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
