import { Hono } from "hono";
import type { AppEnv } from "../../auth/types";
import { canAccessGroup } from "../../auth/authorization";

const realtime = new Hono<AppEnv>();

realtime.get("/groups/:id", async (c) => {
  const groupId = Number(c.req.param("id"));
  const user = c.get("user");
  if (!Number.isInteger(groupId) || groupId < 1 || !canAccessGroup(user, groupId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const group = await c.env["pulse-db"].prepare("SELECT id FROM groups WHERE id = ? LIMIT 1").bind(groupId).first<{ id: number }>();
  if (!group) return new Response("Not found", { status: 404 });
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });

  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Edge-Pulse-User-Id", String(user.id));
  const stub = c.env.GROUPS.getByName(`group:${groupId}`);
  return stub.fetch(new Request(c.req.raw, { headers }));
});

export { realtime };
