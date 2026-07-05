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
  maintenanceEnabled: parseEnabled(input.maintenance_enabled),
  maintenanceUntil: String(input.maintenance_until ?? "").trim() || null,
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

const isLocalDevHost = (hostname: string): boolean => {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    /^127\./.test(hostname)
  );
};

type AccessJwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type AccessJwtPayload = {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
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

const textEncoder = new TextEncoder();
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

const toAudienceList = (value: AccessJwtPayload["aud"]): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
};

const formatAccessAudience = (value: AccessJwtPayload["aud"]): string | null => {
  const audiences = toAudienceList(value);
  return audiences.length > 0 ? audiences.join(", ") : null;
};

const isJsonWebKey = (value: unknown): value is JsonWebKey => {
  return Boolean(value && typeof value === "object");
};

const extractAccessKeys = (payload: unknown): JsonWebKey[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isJsonWebKey);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as { keys?: unknown };
  if (Array.isArray(record.keys)) {
    return record.keys.filter(isJsonWebKey);
  }
  if (record.keys && typeof record.keys === "object") {
    return Object.values(record.keys).filter(isJsonWebKey);
  }

  return [];
};

const verifyAccessJwtSignature = async (
  token: string,
  teamDomain: string,
  audience: string | null,
): Promise<boolean> => {
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) return false;

  const header = decodeJwtPart<AccessJwtHeader>(headerPart);
  const payload = decodeJwtPart<AccessJwtPayload>(payloadPart);
  if (!header || !payload || header.alg !== "RS256") return false;

  let issuer: string | null = null;
  if (payload.iss) {
    try {
      issuer = new URL(payload.iss).hostname;
    } catch {
      return false;
    }
  }
  if (issuer !== teamDomain) return false;

  if (audience) {
    const audiences = toAudienceList(payload.aud);
    if (!audiences.includes(audience)) return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && nowSeconds >= payload.exp) return false;
  if (typeof payload.nbf === "number" && nowSeconds < payload.nbf) return false;

  const certResponse = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!certResponse.ok) {
    return false;
  }

  const certPayload = extractAccessKeys((await certResponse.json()) as unknown);
  if (certPayload.length === 0) {
    return false;
  }

  const data = textEncoder.encode(`${headerPart}.${payloadPart}`);
  const signature = decodeBase64Url(signaturePart);
  const candidates = header.kid ? certPayload.filter((key) => key.kid === header.kid) : certPayload;
  const keysToTry = candidates.length > 0 ? candidates : certPayload;

  for (const key of keysToTry) {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        key,
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        },
        false,
        ["verify"],
      );

      const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, data);
      if (verified) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
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

export const requireCloudflareAccess = async (request: Request, env: Pick<Bindings, "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUDIENCE">): Promise<Response | null> => {
  const { hostname } = new URL(request.url);
  if (isLocalDevHost(hostname)) {
    return null;
  }

  const accessAssertion = request.headers.get("cf-access-jwt-assertion");
  if (!accessAssertion) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Cloudflare Access 経由で接続してください</main>`,
      403,
    );
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUDIENCE?.trim() || null;
  if (!teamDomain) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Cloudflare Access の team domain が設定されていません</main>`,
      500,
    );
  }

  const verified = await verifyAccessJwtSignature(accessAssertion, teamDomain, audience);
  if (!verified) {
    return respondHtml(
      `<main id="content" class="p-6 text-sm text-rose-200" role="alert" aria-live="assertive">Cloudflare Access の認証に失敗しました</main>`,
      403,
    );
  }

  return null;
};

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
