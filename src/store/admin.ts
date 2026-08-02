export type AdminGroup = { id: number; name: string; slug: string; check_count: number };
export type AdminUser = {
  id: number;
  identity_subject: string;
  display_name: string;
  email: string | null;
  role: "member" | "superadmin";
  group_ids: number[];
};
export type AdminCheck = { id: number; name: string; url: string; group_id: number };

export type AdminData = {
  groups: AdminGroup[];
  users: AdminUser[];
  checks: AdminCheck[];
};

export const loadAdminData = async (db: D1Database): Promise<AdminData> => {
  const [groups, users, checks, memberships, checkCounts] = await Promise.all([
    db.prepare("SELECT id, name, slug FROM groups ORDER BY id").all<Omit<AdminGroup, "check_count">>(),
    db.prepare("SELECT id, identity_subject, display_name, email, role FROM users ORDER BY id").all<Omit<AdminUser, "group_ids">>(),
    db.prepare("SELECT id, name, url, group_id FROM checks ORDER BY id").all<AdminCheck>(),
    db.prepare("SELECT user_id, group_id FROM group_members ORDER BY user_id, group_id").all<{ user_id: number; group_id: number }>(),
    db.prepare("SELECT group_id, COUNT(*) AS check_count FROM checks WHERE group_id IS NOT NULL GROUP BY group_id").all<{ group_id: number; check_count: number }>(),
  ]);

  const groupIds = new Map<number, number[]>();
  for (const membership of memberships.results) {
    const ids = groupIds.get(membership.user_id) ?? [];
    ids.push(membership.group_id);
    groupIds.set(membership.user_id, ids);
  }

  const checkCountByGroup = new Map(checkCounts.results.map((row) => [row.group_id, row.check_count]));

  return {
    groups: groups.results.map((group) => ({ ...group, check_count: checkCountByGroup.get(group.id) ?? 0 })),
    users: users.results.map((user) => ({ ...user, group_ids: groupIds.get(user.id) ?? [] })),
    checks: checks.results,
  };
};

const writeAuditLog = (db: D1Database, actorUserId: number, action: string, targetType: string, targetId: number, details: unknown) =>
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)`,
  ).bind(actorUserId, action, targetType, targetId, JSON.stringify(details));

export const createGroup = async (db: D1Database, actorUserId: number, name: string, slug: string, now: string): Promise<void> => {
  const result = await db.prepare("INSERT INTO groups (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id").bind(name.trim(), slug.trim(), now, now).first<{ id: number }>();
  if (!result) throw new Error("group was not created");
  await db.batch([writeAuditLog(db, actorUserId, "group.created", "group", result.id, { name, slug })]);
};

export const setUserGroupMembership = async (db: D1Database, actorUserId: number, userId: number, groupId: number, add: boolean): Promise<void> => {
  const statement = add
    ? db.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)")
    : db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?");
  await db.batch([
    statement.bind(groupId, userId),
    writeAuditLog(db, actorUserId, add ? "user.group_added" : "user.group_removed", "user", userId, { groupId }),
  ]);
};

export const moveCheckToGroup = async (db: D1Database, actorUserId: number, checkId: number, groupId: number): Promise<void> => {
  const check = await db.prepare("SELECT group_id FROM checks WHERE id = ? LIMIT 1").bind(checkId).first<{ group_id: number }>();
  if (!check) throw new Error("check not found");
  if (check.group_id === groupId) return;
  await db.batch([
    db.prepare("UPDATE checks SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(groupId, checkId),
    writeAuditLog(db, actorUserId, "check.group_moved", "check", checkId, { fromGroupId: check.group_id, toGroupId: groupId }),
  ]);
};
