import { createFactory } from "hono/factory";
import type { AppEnv } from "../auth/types";
import { createGroup, loadAdminData, moveCheckToGroup, setUserGroupMembership } from "../store/admin";
import { renderAdminPage, renderAdminPanel } from "../views/admin-page.tsx";
import { respondHtml } from "../http/shared";
import { toErrorMessage } from "../lib/error-message";

const factory = createFactory<AppEnv>();
const forbidden = () => respondHtml(`<main id="content" class="p-6 text-sm text-rose-200" role="alert">管理者権限が必要です</main>`, 403);
const redirect = (request: Request) => Response.redirect(new URL("/admin", request.url), 303);

const requireSuperadmin = (role: string): Response | null => role === "superadmin" ? null : forbidden();
const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";
type AdminContext = { req: { raw: Request }; env: Env };

const operationResponse = async (c: AdminContext, feedback: string | null = null, status = 200): Promise<Response> => {
  if (isHxRequest(c.req.raw)) return respondHtml(renderAdminPanel(await loadAdminData(c.env["pulse-db"]), feedback), 200);
  if (feedback) return respondHtml(`<main id="content" class="p-6 text-sm text-amber-100" role="alert">${feedback}</main>`, status);
  return redirect(c.req.raw);
};

const adminError = async (c: AdminContext, error: unknown): Promise<Response> => {
  const message = toErrorMessage(error);
  console.error(JSON.stringify({ message: "admin operation failed", error: message }));

  if (message.includes("UNIQUE constraint failed: groups.slug")) {
    return operationResponse(c, "その slug はすでに使用されています。別の slug を指定してください。", 409);
  }
  if (message.includes("FOREIGN KEY constraint failed") || message.includes("group not found") || message.includes("check not found")) {
    return operationResponse(c, "指定された対象が見つからないか、現在の状態では操作できません。", 400);
  }
  return operationResponse(c, "管理者操作に失敗しました。", 500);
};

export const handleAdminRequest = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const denied = requireSuperadmin(user.role);
  if (denied) return denied;
  const identity = { displayName: user.displayName, email: user.email, audience: null, subject: user.identitySubject };
  return renderAdminPage(await loadAdminData(c.env["pulse-db"]), identity);
});

export const handleAdminCreateGroup = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const denied = requireSuperadmin(user.role);
  if (denied) return denied;
  const form = await c.req.raw.formData();
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();
  if (!name || !/^[a-z0-9-]+$/.test(slug) || slug === "orphan") {
    return operationResponse(c, "group 名または slug が不正です。", 400);
  }
  try {
    await createGroup(c.env["pulse-db"], user.id, name, slug, new Date().toISOString());
  } catch (error) {
    return adminError(c, error);
  }
  return operationResponse(c);
});

export const handleAdminSetUserGroup = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const denied = requireSuperadmin(user.role);
  if (denied) return denied;
  const form = await c.req.raw.formData();
  const groupId = Number(form.get("group_id") ?? form.get("add_group_id"));
  const targetUserId = Number(c.req.param("id"));
  if (!Number.isInteger(groupId) || groupId < 1 || !Number.isInteger(targetUserId) || targetUserId < 1) {
    return operationResponse(c, "user または group の指定が不正です。", 400);
  }
  try {
    await setUserGroupMembership(c.env["pulse-db"], user.id, targetUserId, groupId, form.get("operation") === "add");
  } catch (error) {
    return adminError(c, error);
  }
  return operationResponse(c);
});

export const handleAdminMoveCheck = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const denied = requireSuperadmin(user.role);
  if (denied) return denied;
  const form = await c.req.raw.formData();
  const checkId = Number(c.req.param("id"));
  const groupId = Number(form.get("group_id"));
  if (!Number.isInteger(checkId) || checkId < 1 || !Number.isInteger(groupId) || groupId < 1) {
    return operationResponse(c, "check または group の指定が不正です。", 400);
  }
  try {
    await moveCheckToGroup(c.env["pulse-db"], user.id, checkId, groupId);
  } catch (error) {
    return adminError(c, error);
  }
  return operationResponse(c);
});
