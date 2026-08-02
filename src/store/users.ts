import type { AuthenticatedUser } from "../auth/types";

export type UserIdentity = {
  identityProvider: string;
  identitySubject: string;
  displayName: string;
  email: string | null;
};

export const ensureUser = async (db: D1Database, identity: UserIdentity): Promise<AuthenticatedUser> => {
  await db
    .prepare(
      `
      INSERT INTO users (identity_provider, identity_subject, display_name, email)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(identity_provider, identity_subject) DO UPDATE SET
        display_name = excluded.display_name,
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP
      `,
    )
    .bind(identity.identityProvider, identity.identitySubject, identity.displayName, identity.email)
    .run();

  const user = await db
    .prepare(
      `
      SELECT id, identity_provider, identity_subject, display_name, email, role
      FROM users
      WHERE identity_provider = ? AND identity_subject = ?
      LIMIT 1
      `,
    )
    .bind(identity.identityProvider, identity.identitySubject)
    .first<{
      id: number;
      identity_provider: string;
      identity_subject: string;
      display_name: string;
      email: string | null;
      role: "member" | "superadmin";
    }>();

  if (!user) throw new Error("authenticated user was not persisted");

  const memberships = await db
    .prepare("SELECT group_id FROM group_members WHERE user_id = ? ORDER BY group_id")
    .bind(user.id)
    .all<{ group_id: number }>();

  return {
    id: user.id,
    identityProvider: user.identity_provider,
    identitySubject: user.identity_subject,
    displayName: user.display_name,
    email: user.email,
    role: user.role,
    groupIds: memberships.results.map((membership) => membership.group_id),
  };
};
