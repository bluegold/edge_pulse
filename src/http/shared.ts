import type { Bindings } from "../lib/bindings";
import type { CheckInput } from "../lib/checks";

export const respondHtml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const respondJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const parseEnabled = (value: unknown): boolean => {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
};

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const readCheckInput = (input: Record<string, unknown>): CheckInput => ({
  name: String(input.name ?? ""),
  url: String(input.url ?? ""),
  method: "GET",
  enabled: parseEnabled(input.enabled),
  expectedStatusMin: parseNumber(input.expected_status_min, 200),
  expectedStatusMax: parseNumber(input.expected_status_max, 399),
  timeoutMs: parseNumber(input.timeout_ms, 10_000),
  intervalMinutes: parseNumber(input.interval_minutes, 5),
  failThreshold: parseNumber(input.fail_threshold, 2),
  recoveryThreshold: parseNumber(input.recovery_threshold, 1),
});

export const readFormCheckInput = async (request: Request): Promise<CheckInput> => {
  const form = await request.formData();
  const input: Record<string, unknown> = {};
  form.forEach((value, key) => {
    input[key] = value;
  });
  return readCheckInput(input);
};

export const readJsonCheckInput = async (request: Request): Promise<CheckInput> => {
  const body = (await request.json()) as Record<string, unknown>;
  return readCheckInput(body);
};

export const readCheckInputFromRequest = async (request: Request): Promise<CheckInput | null> => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return readJsonCheckInput(request);
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return readFormCheckInput(request);
  }

  if (!contentType) {
    return readJsonCheckInput(request);
  }

  return null;
};

const timingSafeEquals = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
};

export const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";

export const requireApiToken = async (request: Request, env: Bindings): Promise<Response | null> => {
  const expected = env.ADMIN_API_TOKEN.trim();
  if (!expected) {
    return respondJson({ error: "API token is not configured" }, 500);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length);
  if (!timingSafeEquals(token, expected)) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  return null;
};
