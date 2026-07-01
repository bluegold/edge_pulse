import type { D1Database } from "./cloudflare";
import type { CheckRow } from "./checks";

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

const normalizePage = (value: number): number => {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
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
