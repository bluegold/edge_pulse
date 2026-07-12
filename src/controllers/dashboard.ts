import { createFactory } from "hono/factory";
import { buildPublicStatusData, loadDashboardData } from "../store/dashboard";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { readCloudflareAccessIdentity, respondHxOrHtml, respondJson } from "../http/shared";

const factory = createFactory<{ Bindings: Env }>();

export const handleDashboardRequest = factory.createHandlers(async (c) => {
  const data = await loadDashboardData(c.env["pulse-db"]);
  const accessIdentity = readCloudflareAccessIdentity(c.req.raw);
  return respondHxOrHtml(c.req.raw, () => renderDashboardShell(data), () => renderDashboardPage(data, accessIdentity));
});

export const handlePublicStatusRequest = factory.createHandlers(async (c) => {
  const data = await loadDashboardData(c.env["pulse-db"]);
  return respondJson(buildPublicStatusData(data));
});
