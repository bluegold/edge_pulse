import type { Bindings } from "../lib/bindings";
import { loadDashboardData } from "../store/dashboard";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { isHxRequest, respondHtml } from "../http/shared";

const renderDashboardContent = async (env: Bindings, shell: boolean): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  return shell ? respondHtml(`<main id="content">${renderDashboardShell(data)}</main>`) : renderDashboardPage(data);
};

export const handleDashboardRequest = async (request: Request, env: Bindings): Promise<Response> => {
  return renderDashboardContent(env, isHxRequest(request));
};
