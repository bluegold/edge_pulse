import type { Bindings } from "../lib/bindings";
import { validateCheckInput, type CheckInput } from "../lib/checks";
import { getCheckById, insertCheck, loadChecksPageData, updateCheck } from "../store/checks";
import { loadDashboardData } from "../store/dashboard";
import { loadCheckDetailData } from "../store/check-detail";
import { renderChecksPage, renderChecksShell } from "../views/checks-page.tsx";
import { renderCheckDetailPage, renderCheckDetailShell } from "../views/check-detail-page.tsx";
import { renderDashboardPage, renderDashboardShell, renderRecentCheckCard } from "../views/dashboard-page.tsx";
import { isHxRequest, readCheckInputFromRequest, readCloudflareAccessIdentity, respondHtml, respondJson, respondHxOrHtml } from "../http/shared";
import { refreshCertificateSnapshot } from "../services/certificate-check";

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

const readValidatedCheckInput = async (
  request: Request,
): Promise<
  | { ok: true; input: CheckInput }
  | { ok: false; response: Response; error: string; status: number }
> => {
  const input = await readCheckInputFromRequest(request);
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
  env: Bindings,
  page: number,
  editId: number | null = null,
  highlightId: number | null = null,
  q = "",
  filter = "",
  order = "",
): Promise<Response> => {
  const data = await loadChecksPageData(env["pulse-db"], page, editId, highlightId, q, filter, order);
  return respondHxOrHtml(request, () => renderChecksShell(data), () => renderChecksPage(data));
};

const renderCheckDetailPageResponse = async (request: Request, env: Bindings, id: number): Promise<Response> => {
  const data = await loadCheckDetailData(env["pulse-db"], id);
  if (!data) {
    return notFoundResponse();
  }

  return respondHxOrHtml(request, () => renderCheckDetailShell(data), () => renderCheckDetailPage(data));
};

const renderDashboardPageResponse = async (request: Request, env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  const accessIdentity = readCloudflareAccessIdentity(request);
  return respondHxOrHtml(request, () => renderDashboardShell(data), () => renderDashboardPage(data, accessIdentity));
};

export const handleChecksRequest = async (
  request: Request,
  env: Bindings,
  page = 1,
  editId: number | null = null,
  highlightId: number | null = null,
): Promise<Response> => {
  const { q, filter, order } = getSearchParamsFromRequest(request);
  return renderChecksPageResponse(request, env, page, editId, highlightId, q, filter, order);
};

export const handleCheckDetailRequest = async (request: Request, env: Bindings, id: number): Promise<Response> => {
  return renderCheckDetailPageResponse(request, env, id);
};

export const handleCreateCheck = async (request: Request, env: Bindings): Promise<Response> => {
  const page = getPageFromRequest(request);
  const { q, filter, order } = getSearchParamsFromRequest(request);
  const inputResult = await readValidatedCheckInput(request);
  if (!inputResult.ok) {
    return inputResult.response;
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  await insertCheck(env["pulse-db"], input, now);
  return renderChecksPageResponse(request, env, page, null, null, q, filter, order);
};

export const handleUpdateCheck = async (request: Request, env: Bindings, id: number): Promise<Response> => {
  const page = getPageFromRequest(request);
  const { q, filter, order } = getSearchParamsFromRequest(request);
  const inputResult = await readValidatedCheckInput(request);
  if (!inputResult.ok) {
    return inputResult.response;
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  await updateCheck(env["pulse-db"], id, input, now);
  return renderChecksPageResponse(request, env, page, null, id, q, filter, order);
};

export const handleCertificateRecheck = async (request: Request, env: Bindings, id: number): Promise<Response> => {
  const check = await getCheckById(env["pulse-db"], id);
  if (!check) {
    return notFoundResponse();
  }

  const result = await refreshCertificateSnapshot(env, check);
  if (!result.ok) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">${result.error}</main>`,
      result.status,
    );
  }

  if (isHxRequest(request)) {
    const updatedCheck = await getCheckById(env["pulse-db"], id);
    if (!updatedCheck) {
      return notFoundResponse();
    }

    return respondHtml(renderRecentCheckCard(updatedCheck));
  }

  return Response.redirect(new URL("/", request.url), 303);
};

export const handleApiListChecks = async (env: Bindings, request: Request): Promise<Response> => {
  const page = getPageFromRequest(request);
  const { q, filter, order } = getSearchParamsFromRequest(request);
  const data = await loadChecksPageData(env["pulse-db"], page, null, null, q, filter, order);
  return respondJson({
    checks: data.checks,
    page: data.page,
    pageSize: data.pageSize,
    totalChecks: data.totalChecks,
    totalPages: data.totalPages,
  });
};

export const handleApiCreateCheck = async (env: Bindings, request: Request): Promise<Response> => {
  const inputResult = await readValidatedCheckInput(request);
  if (!inputResult.ok) {
    return respondJson({ error: inputResult.error }, inputResult.status);
  }
  const input = inputResult.input;

  const now = new Date().toISOString();
  const id = await insertCheck(env["pulse-db"], input, now);
  const check = await getCheckById(env["pulse-db"], id);
  return respondJson({ check }, 201);
};

export const handleApiUpdateCheck = async (env: Bindings, id: number, request: Request): Promise<Response> => {
  const inputResult = await readValidatedCheckInput(request);
  if (!inputResult.ok) {
    return respondJson({ error: inputResult.error }, inputResult.status);
  }
  const input = inputResult.input;

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
