import { loadDashboardData } from "../store/dashboard";
import { toDatabase } from "../lib/database";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { readCloudflareAccessIdentity, respondHxOrHtml } from "../http/shared";

export const handleDashboardRequest = async (request: Request, env: Env): Promise<Response> => {
  const data = await loadDashboardData(toDatabase(env["pulse-db"]));
  const accessIdentity = readCloudflareAccessIdentity(request);
  return respondHxOrHtml(request, () => renderDashboardShell(data), () => renderDashboardPage(data, accessIdentity));
};
