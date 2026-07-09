import type { CheckRow } from "../lib/checks";
import type { Database } from "../lib/database";
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
  latestRecoveryAt: string | null;
  generatedAt: string;
};

export const loadCheckDetailData = async (db: Database, id: number): Promise<CheckDetailData | null> => {
  const check = await db.prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(id).first<CheckRow>();
  if (!check) return null;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [results24h, incidents24h, recentResults, recentEvents, recentIncidents, latestRecovery] = await Promise.all([
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
    db
      .prepare(
        `
        SELECT occurred_at
        FROM status_events
        WHERE check_id = ?
          AND from_state = 'fail'
          AND to_state = 'ok'
        ORDER BY occurred_at DESC, id DESC
        LIMIT 1
      `,
      )
      .bind(id)
      .first<{ occurred_at: string }>(),
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
    latestRecoveryAt: latestRecovery?.occurred_at ?? null,
    generatedAt: new Date().toISOString(),
  };
};
