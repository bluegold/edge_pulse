import type { Bindings } from "../lib/bindings";
import { loadDashboardData } from "../store/dashboard";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { readCloudflareAccessIdentity, respondHxOrHtml } from "../http/shared";

export const handleDashboardRequest = async (request: Request, env: Bindings): Promise<Response> => {
  const data = await loadDashboardData(env["pulse-db"]);
  const accessIdentity = readCloudflareAccessIdentity(request);
  return respondHxOrHtml(request, () => renderDashboardShell(data), () => renderDashboardPage(data, accessIdentity));
};
