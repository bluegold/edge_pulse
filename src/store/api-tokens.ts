import type { AuthenticatedUser } from "../auth/types";

export type ApiTokenRow = {
  id: number;
  name: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const hashApiToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64Url(new Uint8Array(digest));
};

export const createApiToken = async (
  db: D1Database,
  userId: number,
  name: string,
  expiresAt: string | null,
  now: string,
  actorUserId: number,
): Promise<{ id: number; token: string; name: string; expiresAt: string | null }> => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = `ep_${toBase64Url(bytes)}`;
  const inserted = await db.prepare(
    `INSERT INTO api_tokens (user_id, name, token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(userId, name.trim(), await hashApiToken(token), expiresAt, now, now).first<{ id: number }>();
  if (!inserted) throw new Error("api token was not created");

  await db.batch([
    db.prepare(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)`,
    ).bind(actorUserId, "api_token.created", "user", userId, JSON.stringify({ tokenId: inserted.id, name: name.trim() })),
  ]);
  return { id: inserted.id, token, name: name.trim(), expiresAt };
};

export const deleteApiToken = async (db: D1Database, tokenId: number, actorUserId: number, now: string): Promise<boolean> => {
  const token = await db.prepare("SELECT user_id FROM api_tokens WHERE id = ? LIMIT 1").bind(tokenId).first<{ user_id: number }>();
  if (!token) return false;
  const result = await db.prepare("DELETE FROM api_tokens WHERE id = ?").bind(tokenId).run();
  if ((result.meta.changes ?? 0) > 0) {
    await db.batch([
      db.prepare(
        `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)`,
      ).bind(actorUserId, "api_token.deleted", "user", token.user_id, JSON.stringify({ tokenId })),
    ]);
    return true;
  }
  return false;
};

export const deleteApiTokenForUser = async (db: D1Database, tokenId: number, userId: number, now: string): Promise<boolean> => {
  const token = await db.prepare("SELECT user_id FROM api_tokens WHERE id = ? AND user_id = ? LIMIT 1").bind(tokenId, userId).first<{ user_id: number }>();
  if (!token) return false;
  const result = await db.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?").bind(tokenId, userId).run();
  if ((result.meta.changes ?? 0) > 0) {
    await db.batch([
      db.prepare(
        `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)`,
      ).bind(userId, "api_token.deleted", "user", token.user_id, JSON.stringify({ tokenId })),
    ]);
    return true;
  }
  return false;
};

export const listApiTokens = async (db: D1Database, userId: number): Promise<ApiTokenRow[]> => {
  const result = await db.prepare(
    `SELECT id, name, expires_at, revoked_at, last_used_at, created_at
     FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
  ).bind(userId).all<ApiTokenRow>();
  return result.results;
};

export const authenticateApiToken = async (db: D1Database, token: string, now: string): Promise<AuthenticatedUser | null> => {
  const row = await db.prepare(
    `SELECT t.id, t.user_id, t.expires_at, u.identity_provider, u.identity_subject, u.display_name, u.email, u.role
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL LIMIT 1`,
  ).bind(await hashApiToken(token)).first<{
    id: number;
    user_id: number;
    expires_at: string | null;
    identity_provider: string;
    identity_subject: string;
    display_name: string;
    email: string | null;
    role: "member" | "superadmin";
  }>();
  if (!row || (row.expires_at !== null && row.expires_at <= now)) return null;

  await db.prepare("UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?").bind(now, now, row.id).run();
  const memberships = await db.prepare("SELECT group_id FROM group_members WHERE user_id = ? ORDER BY group_id").bind(row.user_id).all<{ group_id: number }>();
  return {
    id: row.user_id,
    identityProvider: row.identity_provider,
    identitySubject: row.identity_subject,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    groupIds: memberships.results.map((membership) => membership.group_id),
  };
};
