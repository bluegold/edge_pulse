import type { MiddlewareHandler } from "hono";
import { readAdminApiToken } from "../../lib/secrets";
import { respondJson } from "../shared";
import type { AppEnv } from "../../auth/types";
import { authenticateApiToken } from "../../store/api-tokens";

const textEncoder = new TextEncoder();

const timingSafeEquals = async (left: string, right: string): Promise<boolean> => {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(left)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(right)),
  ]);

  const subtleCrypto = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) => boolean;
  };

  if (typeof subtleCrypto.timingSafeEqual === "function") {
    return subtleCrypto.timingSafeEqual(leftHash, rightHash);
  }

  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
};

export const apiTokenMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === "/api/public/status" || c.req.path.startsWith("/api/public/")) {
    await next();
    return;
  }
  const authorization = c.req.header("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return respondJson({ error: "Unauthorized" }, 401);
  const token = authorization.slice("Bearer ".length);
  const expected = readAdminApiToken(c.env);
  if (expected && await timingSafeEquals(token, expected)) {
    c.set("user", { id: 0, identityProvider: "admin-api-token", identitySubject: "admin-api-token", displayName: "API administrator", email: null, role: "superadmin", groupIds: [] });
    await next();
    return;
  }
  const user = await authenticateApiToken(c.env["pulse-db"], token, new Date().toISOString());
  if (!user) return respondJson({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};
