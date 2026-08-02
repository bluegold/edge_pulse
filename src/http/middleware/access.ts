import type { MiddlewareHandler } from "hono";
import { JsonBodyError, readJsonWithLimit } from "../../lib/json-body";
import type { AppEnv } from "../../auth/types";
import { ensureUser } from "../../store/users";
import { respondHtml } from "../shared";

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

type AccessJsonWebKey = JsonWebKey & { kid?: string };

const isJsonWebKey = (value: unknown): value is AccessJsonWebKey => {
  return Boolean(value && typeof value === "object");
};

const extractAccessKeys = (payload: unknown): AccessJsonWebKey[] => {
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

  let certPayloadRaw: unknown;
  try {
    certPayloadRaw = await readJsonWithLimit<unknown>(certResponse);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return false;
    }
    throw error;
  }

  const certPayload = extractAccessKeys(certPayloadRaw);
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

      const verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        signature as BufferSource,
        data,
      );
      if (verified) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
};

const requireCloudflareAccess = async (
  request: Request,
  env: Pick<Env, "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUDIENCE" | "DEV_ACCESS_SUBJECT" | "DEV_ACCESS_EMAIL" | "DEV_ACCESS_NAME" | "DEV_ACCESS_ROLE">,
): Promise<Response | null> => {
  const { hostname } = new URL(request.url);
  if (isLocalDevHost(hostname)) {
    if (!env.DEV_ACCESS_SUBJECT?.trim()) {
      return respondHtml(`<main id="content" class="p-6 text-sm text-rose-200" role="alert">DEV_ACCESS_SUBJECT が設定されていません</main>`, 500);
    }
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

export const accessMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const accessCheck = await requireCloudflareAccess(c.req.raw, c.env);
  if (accessCheck) return accessCheck;

  const isLocal = isLocalDevHost(new URL(c.req.url).hostname);
  const identity = isLocal
    ? {
        displayName: c.env.DEV_ACCESS_NAME?.trim() || c.env.DEV_ACCESS_EMAIL?.trim() || c.env.DEV_ACCESS_SUBJECT.trim(),
        email: c.env.DEV_ACCESS_EMAIL?.trim() || null,
        subject: c.env.DEV_ACCESS_SUBJECT.trim(),
        identityProvider: "cloudflare-access-dev",
        role: c.env.DEV_ACCESS_ROLE?.trim() === "superadmin" ? ("superadmin" as const) : ("member" as const),
      }
    : (() => {
        const accessAssertion = c.req.raw.headers.get("cf-access-jwt-assertion");
        if (!accessAssertion) return null;
        const [, payloadPart] = accessAssertion.split(".");
        if (!payloadPart) return null;
        const payload = decodeJwtPart<{ sub?: string; email?: string; name?: string }>(payloadPart);
        if (!payload?.sub?.trim()) return null;
        return {
          displayName: payload.name?.trim() || payload.email?.trim() || payload.sub.trim(),
          email: payload.email?.trim() || null,
          subject: payload.sub.trim(),
          identityProvider: "cloudflare-access",
          role: "member" as const,
        };
      })();

  if (!identity) return respondHtml(`<main id="content" class="p-6 text-sm text-rose-200" role="alert">ユーザー identity を取得できません</main>`, 403);

  const user = await ensureUser(c.env["pulse-db"], {
    identityProvider: identity.identityProvider,
    identitySubject: identity.subject,
    displayName: identity.displayName,
    email: identity.email,
  });

  if (isLocal && identity.role === "superadmin" && user.role !== "superadmin") {
    await c.env["pulse-db"].prepare("UPDATE users SET role = 'superadmin', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    user.role = "superadmin";
  }

  if (c.req.path.startsWith("/assets/")) {
    await next();
    return;
  }

  c.set("user", user);
  await next();
};
