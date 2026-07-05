import type { D1Database } from "../lib/cloudflare";
import type { CheckRow } from "../lib/checks";
import type { IncidentRow, CheckResultRow, StatusEventRow } from "./dashboard";

export type CheckDetailReport = {
  checks24h: number;
  failures24h: number;
  incidents24h: number;
  availability24h: number | null;
  avgLatencyMs: number | null;
  avgRuntimeMs: number | null;
};

export type CheckDetailData = {
  check: CheckRow;
  report: CheckDetailReport;
  recentResults: CheckResultRow[];
  recentEvents: StatusEventRow[];
  recentIncidents: IncidentRow[];
  generatedAt: string;
};

export const loadCheckDetailData = async (db: D1Database, id: number): Promise<CheckDetailData | null> => {
  const check = await db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
  if (!check) return null;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [results24h, incidents24h, recentResults, recentEvents, recentIncidents] = await Promise.all([
    db
      .prepare(
        `
        SELECT
          COUNT(*) AS checks24h,
          SUM(CASE WHEN state = 'fail' THEN 1 ELSE 0 END) AS failures24h,
          AVG(latency_ms) AS avgLatencyMs,
          AVG(x_runtime_ms) AS avgRuntimeMs
        FROM check_results
        WHERE check_id = ?
          AND checked_at >= ?
      `,
      )
      .bind(id, dayAgo)
      .first<{
        checks24h: number;
        failures24h: number;
        avgLatencyMs: number | null;
        avgRuntimeMs: number | null;
      }>(),
    db
      .prepare(
        `
        SELECT COUNT(*) AS incidents24h
        FROM incidents
        WHERE check_id = ?
          AND started_at >= ?
      `,
      )
      .bind(id, dayAgo)
      .first<{ incidents24h: number }>(),
    db
      .prepare(
        `
        SELECT *
        FROM check_results
        WHERE check_id = ?
          AND checked_at >= ?
        ORDER BY checked_at DESC, id DESC
      `,
      )
      .bind(id, dayAgo)
      .all<CheckResultRow>(),
    db
      .prepare(
        `
        SELECT *
        FROM status_events
        WHERE check_id = ?
        ORDER BY occurred_at DESC, id DESC
        LIMIT 20
      `,
      )
      .bind(id)
      .all<StatusEventRow>(),
    db
      .prepare(
        `
        SELECT *
        FROM incidents
        WHERE check_id = ?
        ORDER BY started_at DESC, id DESC
        LIMIT 20
      `,
      )
      .bind(id)
      .all<IncidentRow>(),
  ]);

  const checks24h = results24h?.checks24h ?? 0;
  const failures24h = results24h?.failures24h ?? 0;
  const availability24h = checks24h > 0 ? Math.max(0, Math.min(100, ((checks24h - failures24h) / checks24h) * 100)) : null;

  return {
    check,
    report: {
      checks24h,
      failures24h,
      incidents24h: incidents24h?.incidents24h ?? 0,
      availability24h,
      avgLatencyMs: results24h?.avgLatencyMs ?? null,
      avgRuntimeMs: results24h?.avgRuntimeMs ?? null,
    },
    recentResults: recentResults.results,
    recentEvents: recentEvents.results,
    recentIncidents: recentIncidents.results,
    generatedAt: new Date().toISOString(),
  };
};
