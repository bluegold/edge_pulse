import type { D1Database } from "../lib/cloudflare";
import type { CheckInput, CheckRow } from "../lib/checks";

export type ChecksPageData = {
  checks: CheckRow[];
  page: number;
  pageSize: number;
  totalChecks: number;
  totalPages: number;
  editId: number | null;
  highlightId: number | null;
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
        next_check_at, last_enqueued_at, last_checked_at,
        last_state, last_status_code, last_latency_ms, last_error,
        fail_threshold, recovery_threshold, consecutive_failures, consecutive_successes,
        first_failure_at, first_success_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, ?, ?, 0, 0, NULL, NULL, ?, ?)
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
): Promise<ChecksPageData> => {
  const pageSize = 20;
  const totalRow = await db.prepare(`SELECT COUNT(*) AS count FROM checks`).first<{ count: number }>();
  const totalChecks = totalRow?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalChecks / pageSize));
  const currentPage = Math.min(normalizePage(page), totalPages);
  const offset = (currentPage - 1) * pageSize;

  const checks = await db
    .prepare(
      `
      SELECT *
      FROM checks
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(pageSize, offset)
    .all<CheckRow>();

  return {
    checks: checks.results,
    page: currentPage,
    pageSize,
    totalChecks,
    totalPages,
    editId,
    highlightId,
    generatedAt: new Date().toISOString(),
  };
};

const normalizePage = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
};
