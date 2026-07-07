import type { D1Database } from "../lib/cloudflare";
import type { CheckInput, CheckRow } from "../lib/checks";
import { buildCheckOrderByClause, buildChecksSearchWhereClause } from "../lib/checks-search";

export type ChecksPageData = {
  checks: CheckRow[];
  page: number;
  pageSize: number;
  totalChecks: number;
  totalPages: number;
  editId: number | null;
  highlightId: number | null;
  q: string;
  filter: string;
  order: string;
  searchError: string | null;
  generatedAt: string;
};

export const getCheckById = async (db: D1Database, id: number): Promise<CheckRow | null> => {
  return db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
};

export const insertCheck = async (db: D1Database, input: CheckInput, now: string): Promise<number> => {
  const inserted = await db
    .prepare(
      `
      INSERT INTO checks (
        name, url, method, enabled,
        expected_status_min, expected_status_max, timeout_ms, interval_minutes,
        maintenance_enabled,
        next_check_at, last_enqueued_at, last_checked_at,
        last_state, last_status_code, last_latency_ms, last_error,
        fail_threshold, recovery_threshold, consecutive_failures, consecutive_successes,
        first_failure_at, first_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, ?, ?, 0, 0, NULL, NULL, ?, ?)
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
): Promise<ChecksPageData> => {
  const pageSize = 20;
  const normalizedQuery = q.trim();
  const normalizedFilter = filter.trim();
  const normalizedOrder = order.trim();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const { sql: whereSql, params: whereParams, searchError } = buildChecksSearchWhereClause(normalizedQuery, normalizedFilter, dayAgo);
  const orderBySql = buildCheckOrderByClause(normalizedOrder);
  const whereClause = whereSql ? `WHERE ${whereSql}` : "";

  const countQuery = `
        SELECT COUNT(*) AS count
        FROM checks c
        ${whereClause}
      `;
  const countResult = await db.prepare(countQuery).bind(...whereParams).first<{ count: number }>();

  const totalChecks = searchError ? 0 : countResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalChecks / pageSize));
  const currentPage = Math.min(normalizePage(page), totalPages);
  const offset = (currentPage - 1) * pageSize;
  const dataQuery = `
        SELECT c.*
        FROM checks c
        ${whereClause}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `;
  const checksResult = searchError
    ? { results: [] as CheckRow[] }
    : await db.prepare(dataQuery).bind(...whereParams, pageSize, offset).all<CheckRow>();
  const checks = checksResult.results;

  return {
    checks,
    page: currentPage,
    pageSize,
    totalChecks,
    totalPages,
    editId,
    highlightId,
    q: normalizedQuery,
    filter: normalizedFilter,
    order: normalizedOrder,
    searchError,
    generatedAt: new Date().toISOString(),
  };
};

const normalizePage = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
};
