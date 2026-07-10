import { createFactory } from "hono/factory";
import { validateCheckInput, type CheckInput } from "../lib/checks";
import { JsonBodyError } from "../lib/json-body";
import { getCheckById, insertCheck, loadChecksPageData, updateCheck } from "../store/checks";
import { loadCheckDetailData } from "../store/check-detail";
import { renderChecksPage, renderChecksShell } from "../views/checks-page.tsx";
import { renderCheckDetailPage, renderCheckDetailShell } from "../views/check-detail-page.tsx";
import { renderRecentCheckCard } from "../views/dashboard-page.tsx";
import { isHxRequest, readCheckInputFromRequest, respondHtml, respondJson, respondHxOrHtml } from "../http/shared";
import { refreshCertificateSnapshot } from "../services/certificate-check";

const factory = createFactory<{ Bindings: Env }>();

const unsupportedContentTypeResponse = () =>
  respondHtml(
    `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Unsupported content type</main>`,
    415,
  );

const invalidInputResponse = (error: string) =>
  respondHtml(
    `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${error}</main>`,
    400,
  );

const notFoundResponse = () =>
  respondHtml(
    `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">not_found</main>`,
    404,
  );

const getPageFromRequest = (request: Request): number => {
  return Number(new URL(request.url).searchParams.get("page") ?? "1");
};

const getSearchParamsFromRequest = (request: Request): { q: string; filter: string; order: string } => {
  const searchParams = new URL(request.url).searchParams;
  return {
    q: searchParams.get("q") ?? "",
    filter: searchParams.get("filter") ?? "",
    order: searchParams.get("order") ?? "",
  };
};

const getChecksPageSize = (env: Env): number => {
  const raw = env.CHECKS_PER_PAGE?.trim();
  if (!raw) return 20;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.floor(parsed);
};

const logRejectedRequestBody = (request: Request, error: JsonBodyError): void => {
  console.warn(JSON.stringify({
    message: "request body rejected",
    path: new URL(request.url).pathname,
    method: request.method,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    reason: error.message,
    status: error.status,
  }));
};

const readValidatedCheckInput = async (
  request: Request,
): Promise<
  | { ok: true; input: CheckInput }
  | { ok: false; response: Response; error: string; status: number }
> => {
  let input: CheckInput | null;
  try {
    input = await readCheckInputFromRequest(request);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      logRejectedRequestBody(request, error);
      const response =
        error.status === 413
          ? invalidInputResponse("request_too_large")
          : invalidInputResponse(error.message);
      return { ok: false, response, error: error.message, status: error.status };
    }
    throw error;
  }

  if (!input) {
    return { ok: false, response: unsupportedContentTypeResponse(), error: "unsupported_media_type", status: 415 };
  }

  const validation = validateCheckInput(input);
  if (!validation.ok) {
    return { ok: false, response: invalidInputResponse(validation.error), error: validation.error, status: 400 };
  }

  return { ok: true, input };
};

const renderChecksPageResponse = async (
  request: Request,
  env: Env,
  page: number,
  editId: number | null = null,
  highlightId: number | null = null,
  q = "",
  filter = "",
  order = "",
): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId, q, filter, order, getChecksPageSize(env));
  return respondHxOrHtml(request, () => renderChecksShell(data), () => renderChecksPage(data));
};

const renderCheckDetailPageResponse = async (request: Request, env: Env, id: number): Promise<Response> => {
  const data = await loadCheckDetailData(env["pulse-db"], id);
  if (!data) {
    return notFoundResponse();
  }
  const editing = new URL(request.url).searchParams.get("edit") === "1";

  return respondHxOrHtml(request, () => renderCheckDetailShell(data, editing), () => renderCheckDetailPage(data));
};

export const handleChecksRequest = factory.createHandlers(async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const editId = c.req.query("edit");
  const focusId = c.req.query("focus");
  const { q, filter, order } = getSearchParamsFromRequest(c.req.raw);
  return renderChecksPageResponse(c.req.raw, c.env, page, editId ? Number(editId) : null, focusId ? Number(focusId) : null, q, filter, order);
});

export const handleCheckDetailRequest = factory.createHandlers(async (c) => {
  return renderCheckDetailPageResponse(c.req.raw, c.env, Number(c.req.param("id")));
});

export const handleCreateCheck = factory.createHandlers(async (c) => {
  const page = getPageFromRequest(c.req.raw);
  const { q, filter, order } = getSearchParamsFromRequest(c.req.raw);
  const inputResult = await readValidatedCheckInput(c.req.raw);
  if (!inputResult.ok) {
    return inputResult.response;
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  await insertCheck(c.env["pulse-db"], input, now);
  return renderChecksPageResponse(c.req.raw, c.env, page, null, null, q, filter, order);
});

export const handleUpdateCheck = factory.createHandlers(async (c) => {
  const page = getPageFromRequest(c.req.raw);
  const { q, filter, order } = getSearchParamsFromRequest(c.req.raw);
  const view = new URL(c.req.url).searchParams.get("view");
  const inputResult = await readValidatedCheckInput(c.req.raw);
  if (!inputResult.ok) {
    return inputResult.response;
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  const id = Number(c.req.param("id"));
  await updateCheck(c.env["pulse-db"], id, input, now);
  if (view === "detail") {
    return renderCheckDetailPageResponse(c.req.raw, c.env, id);
  }
  return renderChecksPageResponse(c.req.raw, c.env, page, null, id, q, filter, order);
});

export const handleCertificateRecheck = factory.createHandlers(async (c) => {
  const id = Number(c.req.param("id"));
  const check = await getCheckById(c.env["pulse-db"], id);
  if (!check) {
    return notFoundResponse();
  }

  const result = await refreshCertificateSnapshot(c.env, check);
  if (!result.ok) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${result.error}</main>`,
      result.status,
    );
  }

  if (isHxRequest(c.req.raw)) {
    const updatedCheck = await getCheckById(c.env["pulse-db"], id);
    if (!updatedCheck) {
      return notFoundResponse();
    }

    return respondHtml(renderRecentCheckCard(updatedCheck));
  }

  return Response.redirect(new URL("/", c.req.url), 303);
});

export const handleApiListChecks = factory.createHandlers(async (c) => {
  const page = getPageFromRequest(c.req.raw);
  const { q, filter, order } = getSearchParamsFromRequest(c.req.raw);
  const data = await loadChecksPageData(c.env["pulse-db"], page, null, null, q, filter, order, getChecksPageSize(c.env));
  return respondJson({
    checks: data.checks,
    page: data.page,
    pageSize: data.pageSize,
    totalChecks: data.totalChecks,
    totalPages: data.totalPages,
  });
});

export const handleApiCreateCheck = factory.createHandlers(async (c) => {
  const inputResult = await readValidatedCheckInput(c.req.raw);
  if (!inputResult.ok) {
    return respondJson({ error: inputResult.error }, inputResult.status);
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  const id = await insertCheck(c.env["pulse-db"], input, now);
  const check = await getCheckById(c.env["pulse-db"], id);
  return respondJson({ check }, 201);
});

export const handleApiUpdateCheck = factory.createHandlers(async (c) => {
  const inputResult = await readValidatedCheckInput(c.req.raw);
  if (!inputResult.ok) {
    return respondJson({ error: inputResult.error }, inputResult.status);
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  const id = Number(c.req.param("id"));
  await updateCheck(c.env["pulse-db"], id, input, now);
  const check = await getCheckById(c.env["pulse-db"], id);
  if (!check) {
    return respondJson({ error: "not_found" }, 404);
  }

  return respondJson({ check });
});

export const handleApiGetCheck = factory.createHandlers(async (c) => {
  const id = Number(c.req.param("id"));
  const check = await getCheckById(c.env["pulse-db"], id);
  if (!check) {
    return respondJson({ error: "not_found" }, 404);
  }
  return respondJson({ check });
});
