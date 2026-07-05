import type { Bindings } from "../lib/bindings";
import { dispatchTestNotifications } from "../services/notifications";
import { respondJson } from "../http/shared";

const readTestNotificationInput = async (request: Request): Promise<{ title: string; message: string; severity: "danger" | "good" }> => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return {
      title: "通知テスト",
      message: "edge-pulse notification test",
      severity: "good",
    };
  }

  const body = (await request.json()) as Record<string, unknown>;
  const severity = body.severity === "danger" ? "danger" : "good";

  return {
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "通知テスト",
    message: typeof body.message === "string" && body.message.trim() ? body.message.trim() : "edge-pulse notification test",
    severity,
  };
};

export const handleApiTestNotifications = async (env: Bindings, request: Request): Promise<Response> => {
  const input = await readTestNotificationInput(request);
  const sent = await dispatchTestNotifications(env, {
    ...input,
    sentAt: new Date().toISOString(),
  });

  return respondJson({
    ok: true,
    sent,
    title: input.title,
    severity: input.severity,
  });
};
