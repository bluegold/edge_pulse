import type { MiddlewareHandler } from "hono";
import { readAdminApiToken, type SecretEnv } from "../../lib/secrets";
import { respondJson } from "../shared";

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

const requireApiToken = async (
  request: Request,
  env: Pick<SecretEnv, "ADMIN_API_TOKEN">,
): Promise<Response | null> => {
  const expected = readAdminApiToken(env);
  if (!expected) {
    console.error(JSON.stringify({
      message: "admin api token is not configured",
    }));
    return respondJson({ error: "Unauthorized" }, 401);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length);
  if (!(await timingSafeEquals(token, expected))) {
    return respondJson({ error: "Unauthorized" }, 401);
  }

  return null;
};

export const apiTokenMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.path === "/api/public/status" || c.req.path.startsWith("/api/public/")) {
    await next();
    return;
  }
  const tokenCheck = await requireApiToken(c.req.raw, c.env);
  if (tokenCheck) return tokenCheck;
  await next();
};
