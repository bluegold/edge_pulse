import type { CheckInput, CheckRow } from "../lib/checks";
import { buildCheckOrderByClause, buildChecksSearchWhereClause } from "../lib/checks-search";
import { summarizeChecks } from "../lib/checks-summary";

export type ChecksPageRow = CheckRow & {
  uptime_started_at?: string | null;
  group_name?: string | null;
  group_slug?: string | null;
};

export type ChecksGroup = { id: number; name: string; slug: string };

export type ChecksPageData = {
  checks: ChecksPageRow[];
  page: number;
  pageSize: number;
  totalChecks: number;
  okChecks: number;
  stoppedChecks: number;
  totalPages: number;
  editId: number | null;
  highlightId: number | null;
  q: string;
  filter: string;
  order: string;
  groupId?: number | null;
  groups?: ChecksGroup[];
  searchError: string | null;
  generatedAt: string;
};

export const getCheckById = async (db: D1Database, id: number, groupIds: number[] | null = null): Promise<ChecksPageRow | null> => {
  const groupClause = groupIds === null ? "" : groupIds.length > 0 ? ` AND c.group_id IN (${groupIds.map(() => "?").join(", ")})` : " AND 1 = 0";
  return db
    .prepare(
      `
      SELECT
        c.*,
        (
          SELECT e.occurred_at
          FROM status_events e
          WHERE e.check_id = c.id
            AND e.to_state = 'ok'
          ORDER BY e.occurred_at DESC, e.id DESC
          LIMIT 1
        ) AS uptime_started_at,
        (
          SELECT r.x_runtime_ms
          FROM check_results r
          WHERE r.check_id = c.id
          ORDER BY r.checked_at DESC, r.id DESC
          LIMIT 1
        ) AS last_runtime_ms
      FROM checks c
      WHERE c.id = ?${groupClause}
      LIMIT 1
    `,
    )
    .bind(id, ...(groupIds ?? []))
    .first<ChecksPageRow>();
};

export const insertCheck = async (db: D1Database, input: CheckInput, now: string): Promise<number> => {
  const inserted = await db
    .prepare(
      `
      INSERT INTO checks (
        name, url, method, enabled,
        expected_status_min, expected_status_max, timeout_ms, interval_minutes,
        maintenance_enabled, group_id,
        next_check_at, last_enqueued_at, last_checked_at,
        last_state, last_status_code, last_latency_ms, last_error,
        fail_threshold, recovery_threshold, consecutive_failures, consecutive_successes,
        first_failure_at, first_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, ?, ?, 0, 0, NULL, NULL, ?, ?)
      RETURNING id
    `,
    )
    .bind(
      input.name.trim(),
      input.url.trim(),
      input.method,
      input.enabled ? 1 : 0,
      input.expectedStatusMin,
      input.expectedStatusMax,
      input.timeoutMs,
      input.intervalMinutes,
      input.maintenanceEnabled ? 1 : 0,
      input.failThreshold,
      input.recoveryThreshold,
      now,
      now,
    )
    .first<{ id: number }>();

  return inserted?.id ?? 0;
};

export const updateCheck = async (db: D1Database, id: number, input: CheckInput, now: string): Promise<void> => {
  await db
    .prepare(
      `
      UPDATE checks
      SET name = ?, url = ?, method = ?, enabled = ?,
          expected_status_min = ?, expected_status_max = ?, timeout_ms = ?, interval_minutes = ?,
          maintenance_enabled = ?,
          fail_threshold = ?, recovery_threshold = ?, updated_at = ?
      WHERE id = ?
    `,
    )
    .bind(
      input.name.trim(),
      input.url.trim(),
      input.method,
      input.enabled ? 1 : 0,
      input.expectedStatusMin,
      input.expectedStatusMax,
      input.timeoutMs,
      input.intervalMinutes,
      input.maintenanceEnabled ? 1 : 0,
      input.failThreshold,
      input.recoveryThreshold,
      now,
      id,
    )
    .run();
};

export const loadChecksPageData = async (
  db: D1Database,
  page: number,
  editId: number | null = null,
  highlightId: number | null = null,
  q = "",
  filter = "",
  order = "",
  pageSize = 20,
  groupIds: number[] | null = null,
  groupId: number | null = null,
): Promise<ChecksPageData> => {
  const normalizedPageSize = normalizePageSize(pageSize);
  const normalizedQuery = q.trim();
  const normalizedFilter = filter.trim();
  const normalizedOrder = order.trim();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { sql: whereSql, params: whereParams, searchError } = buildChecksSearchWhereClause(normalizedQuery, normalizedFilter, dayAgo);
  const orderBySql = buildCheckOrderByClause(normalizedOrder);
  const groupClause = groupIds === null ? "" : groupIds.length > 0 ? `c.group_id IN (${groupIds.map(() => "?").join(", ")})` : "1 = 0";
  const selectedGroupClause = groupId === null ? "" : "c.group_id = ?";
  const whereParts = [whereSql, groupClause, selectedGroupClause].filter(Boolean);
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
  const scopedWhereParams = [...whereParams, ...(groupIds ?? []), ...(groupId === null ? [] : [groupId])];

  const groupsWhere = groupIds === null ? "" : groupIds.length > 0 ? `WHERE id IN (${groupIds.map(() => "?").join(", ")})` : "WHERE 1 = 0";
  const groupsResult = await db.prepare(`SELECT id, name, slug FROM groups ${groupsWhere} ORDER BY name, id`).bind(...(groupIds ?? [])).all<ChecksGroup>();

  const countQuery = `
        SELECT COUNT(*) AS count
        FROM checks c
        ${whereClause}
      `;
  const countResult = await db.prepare(countQuery).bind(...scopedWhereParams).first<{ count: number }>();
  const summaryQuery = `
        SELECT c.*
        FROM checks c
        ${whereClause}
      `;
  const summaryChecks = searchError ? { results: [] as CheckRow[] } : await db.prepare(summaryQuery).bind(...scopedWhereParams).all<CheckRow>();

  const totalChecks = searchError ? 0 : countResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalChecks / normalizedPageSize));
  const currentPage = Math.min(normalizePage(page), totalPages);
  const offset = (currentPage - 1) * normalizedPageSize;
  const dataQuery = `
        SELECT
          c.*,
          g.name AS group_name,
          g.slug AS group_slug,
          (
            SELECT e.occurred_at
            FROM status_events e
            WHERE e.check_id = c.id
              AND e.to_state = 'ok'
            ORDER BY e.occurred_at DESC, e.id DESC
            LIMIT 1
          ) AS uptime_started_at,
          (
            SELECT r.x_runtime_ms
            FROM check_results r
            WHERE r.check_id = c.id
            ORDER BY r.checked_at DESC, r.id DESC
            LIMIT 1
          ) AS last_runtime_ms
        FROM checks c
        LEFT JOIN groups g ON g.id = c.group_id
        ${whereClause}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `;
  const checksResult = searchError
    ? { results: [] as ChecksPageRow[] }
    : await db.prepare(dataQuery).bind(...scopedWhereParams, normalizedPageSize, offset).all<ChecksPageRow>();
  const checks = checksResult.results;

  const summary = summarizeChecks(summaryChecks.results);

  return {
    checks,
    page: currentPage,
    pageSize: normalizedPageSize,
    totalChecks,
    okChecks: summary.okChecks,
    stoppedChecks: summary.stoppedChecks,
    totalPages,
    editId,
    highlightId,
    q: normalizedQuery,
    filter: normalizedFilter,
    order: normalizedOrder,
    groupId,
    groups: groupsResult.results,
    searchError,
    generatedAt: new Date().toISOString(),
  };
};

const normalizePage = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
};

const normalizePageSize = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) return 20;
  return Math.floor(value);
};
