export const INCIDENT_REACTIONS = [
  { key: "investigating", emoji: "👀", label: "調査中" },
  { key: "responding", emoji: "🛠️", label: "対応中" },
  { key: "acknowledged", emoji: "👍", label: "確認済み" },
] as const;

export type IncidentReactionKey = (typeof INCIDENT_REACTIONS)[number]["key"];

export type IncidentReactionSummary = {
  key: IncidentReactionKey;
  emoji: string;
  label: string;
  count: number;
  reacted: boolean;
};

export type IncidentReactionActor = {
  userId: number;
  displayName: string;
  reactionKey: IncidentReactionKey;
  emoji: string;
  label: string;
  createdAt: string;
};

export type IncidentReactionHistory = {
  id: number;
  displayName: string;
  action: "added" | "removed";
  reactionKey: IncidentReactionKey;
  emoji: string;
  label: string;
  createdAt: string;
};

type ReactionCountRow = {
  incident_id: number;
  reaction_key: IncidentReactionKey;
  count: number;
  reacted: number;
};

const emptySummaries = (): IncidentReactionSummary[] => INCIDENT_REACTIONS.map((reaction) => ({
  ...reaction,
  count: 0,
  reacted: false,
}));

export const isIncidentReactionKey = (value: string): value is IncidentReactionKey =>
  INCIDENT_REACTIONS.some((reaction) => reaction.key === value);

export const loadIncidentReactions = async (
  db: D1Database,
  incidentIds: number[],
  userId: number | null,
): Promise<Map<number, IncidentReactionSummary[]>> => {
  const result = new Map(incidentIds.map((id) => [id, emptySummaries()]));
  if (incidentIds.length === 0) return result;

  const placeholders = incidentIds.map(() => "?").join(", ");
  const rows = await db.prepare(
    `SELECT incident_id, reaction_key, COUNT(*) AS count,
            MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS reacted
     FROM incident_reactions
     WHERE incident_id IN (${placeholders})
     GROUP BY incident_id, reaction_key`,
  ).bind(userId ?? -1, ...incidentIds).all<ReactionCountRow>();

  for (const row of rows.results) {
    const summaries = result.get(row.incident_id);
    const summary = summaries?.find((item) => item.key === row.reaction_key);
    if (summary) {
      summary.count = row.count;
      summary.reacted = row.reacted === 1;
    }
  }
  return result;
};

export const loadIncidentReactionDetails = async (
  db: D1Database,
  incidentIds: number[],
): Promise<Map<number, { current: IncidentReactionActor[]; history: IncidentReactionHistory[] }>> => {
  const details = new Map(incidentIds.map((id) => [id, { current: [] as IncidentReactionActor[], history: [] as IncidentReactionHistory[] }]));
  if (incidentIds.length === 0) return details;
  const placeholders = incidentIds.map(() => "?").join(", ");
  const [current, history] = await Promise.all([
    db.prepare(
      `SELECT ir.incident_id, ir.user_id, u.display_name, ir.reaction_key, ir.created_at
       FROM incident_reactions ir JOIN users u ON u.id = ir.user_id
       WHERE ir.incident_id IN (${placeholders})
       ORDER BY ir.created_at ASC, ir.id ASC`,
    ).bind(...incidentIds).all<{ incident_id: number; user_id: number; display_name: string; reaction_key: IncidentReactionKey; created_at: string }>(),
    db.prepare(
      `SELECT a.id, a.target_id AS incident_id, a.action, a.actor_user_id, u.display_name, a.details_json, a.created_at
       FROM audit_logs a JOIN users u ON u.id = a.actor_user_id
       WHERE a.target_type = 'incident'
         AND a.target_id IN (${placeholders})
         AND a.action IN ('incident.reaction_added', 'incident.reaction_removed')
       ORDER BY a.created_at DESC, a.id DESC`,
    ).bind(...incidentIds).all<{ id: number; incident_id: number; action: string; actor_user_id: number; display_name: string; details_json: string | null; created_at: string }>(),
  ]);

  for (const row of current.results) {
    const reaction = INCIDENT_REACTIONS.find((item) => item.key === row.reaction_key);
    const target = details.get(row.incident_id);
    if (reaction && target) target.current.push({ userId: row.user_id, displayName: row.display_name, reactionKey: row.reaction_key, emoji: reaction.emoji, label: reaction.label, createdAt: row.created_at });
  }
  for (const row of history.results) {
    let reactionKey: IncidentReactionKey | null = null;
    try {
      const detailsJson = row.details_json ? JSON.parse(row.details_json) as { reactionKey?: unknown } : null;
      reactionKey = typeof detailsJson?.reactionKey === "string" && isIncidentReactionKey(detailsJson.reactionKey) ? detailsJson.reactionKey : null;
    } catch {
      reactionKey = null;
    }
    const reaction = reactionKey ? INCIDENT_REACTIONS.find((item) => item.key === reactionKey) : null;
    const target = details.get(row.incident_id);
    if (reaction && target && (row.action === "incident.reaction_added" || row.action === "incident.reaction_removed")) {
      target.history.push({ id: row.id, displayName: row.display_name, action: row.action === "incident.reaction_added" ? "added" : "removed", reactionKey: reaction.key, emoji: reaction.emoji, label: reaction.label, createdAt: row.created_at });
    }
  }
  return details;
};

export const getIncidentGroupId = async (
  db: D1Database,
  incidentId: number,
  groupIds: number[] | null,
): Promise<number | null> => {
  const groupClause = groupIds === null ? "" : groupIds.length > 0 ? ` AND c.group_id IN (${groupIds.map(() => "?").join(", ")})` : " AND 1 = 0";
  const row = await db.prepare(
    `SELECT c.group_id
     FROM incidents i JOIN checks c ON c.id = i.check_id
     WHERE i.id = ?${groupClause} LIMIT 1`,
  ).bind(incidentId, ...(groupIds ?? [])).first<{ group_id: number | null }>();
  return row?.group_id ?? null;
};

export const toggleIncidentReaction = async (
  db: D1Database,
  incidentId: number,
  userId: number,
  reactionKey: IncidentReactionKey,
  now: string,
): Promise<boolean> => {
  const existing = await db.prepare(
    "SELECT id FROM incident_reactions WHERE incident_id = ? AND user_id = ? AND reaction_key = ? LIMIT 1",
  ).bind(incidentId, userId, reactionKey).first<{ id: number }>();

  if (existing) {
    await db.batch([
      db.prepare("DELETE FROM incident_reactions WHERE id = ?").bind(existing.id),
      db.prepare("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)").bind(userId, "incident.reaction_removed", "incident", incidentId, JSON.stringify({ reactionKey, at: now })),
    ]);
    return false;
  }

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO incident_reactions (incident_id, user_id, reaction_key, created_at) VALUES (?, ?, ?, ?)").bind(incidentId, userId, reactionKey, now),
    db.prepare("INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)").bind(userId, "incident.reaction_added", "incident", incidentId, JSON.stringify({ reactionKey, at: now })),
  ]);
  return true;
};
