import type { CheckInput } from "../lib/checks";
import { JsonBodyError, readJsonWithLimit } from "../lib/json-body";

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

export const respondHxOrHtml = (
  request: Request,
  shellRenderer: () => string,
  fullPageRenderer: () => Response,
): Response => {
  if (isHxRequest(request)) {
    return respondHtml(`<main id="content">${shellRenderer()}</main>`);
  }
  return fullPageRenderer();
};

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
  maintenanceEnabled: parseEnabled(input.maintenance_enabled),
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
  const body = await readJsonWithLimit<Record<string, unknown>>(request);
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

export const isHxRequest = (request: Request): boolean => request.headers.get("HX-Request") === "true";

type AccessJwtPayload = {
  aud?: string | string[];
  email?: string;
  name?: string;
  sub?: string;
};

export type CloudflareAccessIdentity = {
  displayName: string;
  email: string | null;
  audience: string | null;
  subject: string | null;
};

const textDecoder = new TextDecoder();

const decodeBase64Url = (value: string): Uint8Array => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeJwtPart = <T>(value: string): T | null => {
  try {
    return JSON.parse(textDecoder.decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
};

const formatAccessAudience = (value: AccessJwtPayload["aud"]): string | null => {
  const audiences = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? [value]
      : [];
  return audiences.length > 0 ? audiences.join(", ") : null;
};

export const readCloudflareAccessIdentity = (request: Request): CloudflareAccessIdentity | null => {
  const accessAssertion = request.headers.get("cf-access-jwt-assertion");
  if (!accessAssertion) return null;

  const [, payloadPart] = accessAssertion.split(".");
  if (!payloadPart) return null;

  const payload = decodeJwtPart<AccessJwtPayload>(payloadPart);
  if (!payload) return null;

  const displayName = payload.name?.trim() || payload.email?.trim() || payload.sub?.trim() || "unknown";
  return {
    displayName,
    email: payload.email?.trim() || null,
    audience: formatAccessAudience(payload.aud),
    subject: payload.sub?.trim() || null,
  };
};
