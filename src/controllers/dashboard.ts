import { createFactory } from "hono/factory";
import { visibleGroupIds } from "../auth/authorization";
import type { AppEnv } from "../auth/types";
import { buildPublicStatusData, loadDashboardData } from "../store/dashboard";
import { renderDashboardPage, renderDashboardShell } from "../views/dashboard-page.tsx";
import { respondHxOrHtml, respondJson } from "../http/shared";
import { renderPendingAccessPage } from "../views/pending-access";

const factory = createFactory<AppEnv>();

export const handleDashboardRequest = factory.createHandlers(async (c) => {
  const user = c.get("user");
  if (user.role !== "superadmin" && user.groupIds.length === 0) {
    return respondHxOrHtml(c.req.raw, renderPendingAccessPage, () => new Response(renderPendingAccessPage(), { headers: { "content-type": "text/html; charset=utf-8" } }));
  }
  const data = await loadDashboardData(c.env["pulse-db"], visibleGroupIds(user), user.id);
  const realtimeGroupIds = user.role === "superadmin"
    ? (await c.env["pulse-db"].prepare("SELECT id FROM groups ORDER BY id").all<{ id: number }>()).results.map((group) => group.id)
    : user.groupIds;
  const accessIdentity = {
    displayName: user.displayName,
    email: user.email,
    audience: null,
    subject: user.identitySubject,
  };
  return respondHxOrHtml(c.req.raw, () => renderDashboardShell(data, realtimeGroupIds), () => renderDashboardPage(data, accessIdentity, user.role === "superadmin", realtimeGroupIds));
});

export const handlePublicStatusRequest = factory.createHandlers(async (c) => {
  const data = await loadDashboardData(c.env["pulse-db"]);
  return respondJson(buildPublicStatusData(data));
});
