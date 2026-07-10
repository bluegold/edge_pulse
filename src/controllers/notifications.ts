import { createFactory } from "hono/factory";
import { JsonBodyError, readJsonWithLimit } from "../lib/json-body";
import { dispatchTestNotifications } from "../services/notifications";
import { respondJson } from "../http/shared";

const factory = createFactory<{ Bindings: Env }>();

const logRejectedRequestBody = (request: Request, error: JsonBodyError): void => {
  console.warn(JSON.stringify({
    message: "request body rejected",
    path: new URL(request.url).pathname,
    method: request.method,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    reason: error.message,
    status: error.status,
  }));
};

const readTestNotificationInput = async (request: Request): Promise<{ title: string; message: string; severity: "danger" | "good" }> => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return {
      title: "通知テスト",
      message: "edge-pulse notification test",
      severity: "good",
    };
  }

  const body = await readJsonWithLimit<Record<string, unknown>>(request);
  const severity = body.severity === "danger" ? "danger" : "good";

  return {
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "通知テスト",
    message: typeof body.message === "string" && body.message.trim() ? body.message.trim() : "edge-pulse notification test",
    severity,
  };
};

export const handleApiTestNotifications = factory.createHandlers(async (c) => {
  let input: { title: string; message: string; severity: "danger" | "good" };
  try {
    input = await readTestNotificationInput(c.req.raw);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      logRejectedRequestBody(c.req.raw, error);
      return respondJson({ error: error.message }, error.status);
    }
    throw error;
  }

  const sent = await dispatchTestNotifications(c.env, {
    ...input,
    sentAt: new Date().toISOString(),
  });

  return respondJson({
    ok: true,
    sent,
    title: input.title,
    severity: input.severity,
  });
});
