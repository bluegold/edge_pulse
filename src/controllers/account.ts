import { createFactory } from "hono/factory";
import type { Context } from "hono";
import type { AppEnv } from "../auth/types";
import { createApiToken, deleteApiTokenForUser, listApiTokens } from "../store/api-tokens";
import { respondHtml } from "../http/shared";
import { renderAccountPage, renderAccountPanel } from "../views/account-page.tsx";
import { toErrorMessage } from "../lib/error-message";

const factory = createFactory<AppEnv>();
const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";

const accountResponse = async (c: Context<AppEnv>, feedback: string | null = null, newToken: string | null = null, status = 200): Promise<Response> => {
  const user = c.get("user");
  const tokens = await listApiTokens(c.env["pulse-db"], user.id);
  if (isHxRequest(c.req.raw)) return respondHtml(renderAccountPanel(tokens, feedback, newToken));
  const page = renderAccountPage(tokens, { displayName: user.displayName, email: user.email, audience: null, subject: user.identitySubject }, user.role === "superadmin");
  return new Response(page.body, { status, headers: page.headers });
};

export const handleAccountRequest = factory.createHandlers(async (c) => {
  const user = c.get("user");
  return renderAccountPage(await listApiTokens(c.env["pulse-db"], user.id), { displayName: user.displayName, email: user.email, audience: null, subject: user.identitySubject }, user.role === "superadmin");
});

export const handleAccountCreateToken = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const form = await c.req.raw.formData();
  const name = String(form.get("name") ?? "").trim();
  const rawExpiresAt = String(form.get("expires_at") ?? "").trim();
  if (!name || name.length > 100) return accountResponse(c, "用途名を入力してください。", null, 400);
  let expiresAt: string | null = null;
  if (rawExpiresAt) {
    const parsed = new Date(rawExpiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return accountResponse(c, "有効期限は未来の日時を指定してください。", null, 400);
    expiresAt = parsed.toISOString();
  }
  try {
    const created = await createApiToken(c.env["pulse-db"], user.id, name, expiresAt, new Date().toISOString(), user.id);
    return accountResponse(c, null, created.token);
  } catch (error) {
    console.error(JSON.stringify({ message: "account api token creation failed", error: toErrorMessage(error) }));
    return accountResponse(c, "token の作成に失敗しました。", null, 400);
  }
});

export const handleAccountDeleteToken = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const tokenId = Number(c.req.param("id"));
  if (!Number.isInteger(tokenId) || tokenId < 1) return accountResponse(c, "token の指定が不正です。", null, 400);
  const deleted = await deleteApiTokenForUser(c.env["pulse-db"], tokenId, user.id, new Date().toISOString());
  return accountResponse(c, deleted ? "token を削除しました。" : "指定された token が見つかりません。", null, deleted ? 200 : 404);
});
