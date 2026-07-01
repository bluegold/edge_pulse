import type { Bindings } from "../lib/bindings";
import { loadDashboardData } from "../store/dashboard";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { isHxRequest, respondHtml } from "../http/shared";

export const renderDashboard = async (env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return renderDashboardPage(data);
};

export const renderDashboardShellResponse = async (env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return respondHtml(`<main id="content">${renderDashboardShell(data)}</main>`);
};

export const handleDashboardRequest = async (request: Request, env: Bindings): Promise<Response> => {
  return isHxRequest(request) ? renderDashboardShellResponse(env) : renderDashboard(env);
};
