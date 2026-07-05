import type { D1Database } from "../lib/cloudflare";
import { isCertificateExpiringSoon, type CheckRow, type CheckState } from "../lib/checks";

export type IncidentRow = {
  id: number;
  check_id: number;
  check_name: string;
  check_url: string;
  started_at: string;
  resolved_at: string | null;
  start_reason: string | null;
  end_reason: string | null;
  start_status_code: number | null;
  end_status_code: number | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
};

export type CheckResultRow = {
  id: number;
  check_id: number;
  check_name?: string;
  state: "ok" | "fail";
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
  x_runtime_ms?: number | null;
  server_timing_json?: string | null;
  checked_at: string;
};

export type StatusEventRow = {
  id: number;
  check_id: number;
  check_name?: string;
  from_state: CheckState;
  to_state: CheckState;
  reason: string | null;
  status_code: number | null;
  error: string | null;
  latency_ms: number | null;
  occurred_at: string;
};

export type DashboardData = {
  checks: CheckRow[];
  recentChecks: CheckRow[];
  currentIncidents: IncidentRow[];
  recentIncidents: IncidentRow[];
  recentResults: CheckResultRow[];
  recentEvents: StatusEventRow[];
  incidents24h: number;
  generatedAt: string;
};

const RECENT_CHECKS_LIMIT = 5;

const compareCheckAttention = (a: CheckRow, b: CheckRow): number => {
  const aFail = a.last_state === "fail";
  const bFail = b.last_state === "fail";
  if (aFail !== bFail) return aFail ? -1 : 1;

  const aCertError = Boolean(a.tls_last_error);
  const bCertError = Boolean(b.tls_last_error);
  if (aCertError !== bCertError) return aCertError ? -1 : 1;

  const aCertSoon = isCertificateExpiringSoon(a.tls_days_remaining ?? null);
  const bCertSoon = isCertificateExpiringSoon(b.tls_days_remaining ?? null);
  if (aCertSoon !== bCertSoon) return aCertSoon ? -1 : 1;

  const aCheckedAt = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
  const bCheckedAt = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
  if (aCheckedAt !== bCheckedAt) return bCheckedAt - aCheckedAt;

  return b.id - a.id;
};

const isAttentionCheck = (check: CheckRow): boolean =>
  check.last_state === "fail" ||
  Boolean(check.tls_last_error) ||
  isCertificateExpiringSoon(check.tls_days_remaining ?? null);

export const loadDashboardData = async (db: D1Database): Promise<DashboardData> => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const [checks, currentIncidents, recentIncidents, recentResults, recentEvents, incidents24h] = await Promise.all([
    db.prepare(`SELECT * FROM checks ORDER BY created_at DESC, id DESC`).all<CheckRow>(),
    db
      .prepare(
        `
        SELECT i.*, c.name AS check_name, c.url AS check_url
        FROM incidents i
        JOIN checks c ON c.id = i.check_id
        WHERE i.resolved_at IS NULL
        ORDER BY i.started_at DESC, i.id DESC
      `,
      )
      .all<IncidentRow>(),
    db
      .prepare(
        `
        SELECT i.*, c.name AS check_name, c.url AS check_url
        FROM incidents i
        JOIN checks c ON c.id = i.check_id
        ORDER BY i.started_at DESC, i.id DESC
        LIMIT 12
      `,
      )
      .all<IncidentRow>(),
    db
      .prepare(
        `
        SELECT r.*, c.name AS check_name
        FROM check_results r
        JOIN checks c ON c.id = r.check_id
        ORDER BY r.checked_at DESC, r.id DESC
        LIMIT 12
      `,
      )
      .all<CheckResultRow & { check_name: string }>(),
    db
      .prepare(
        `
        SELECT e.*, c.name AS check_name
        FROM status_events e
        JOIN checks c ON c.id = e.check_id
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT 12
      `,
      )
      .all<StatusEventRow & { check_name: string }>(),
    db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM incidents
        WHERE started_at >= ?
      `,
      )
      .bind(dayAgo)
      .first<{ count: number }>(),
  ]);

  const recentChecks = checks.results.filter(isAttentionCheck).sort(compareCheckAttention).slice(0, RECENT_CHECKS_LIMIT);

  return {
    checks: checks.results,
    recentChecks,
    currentIncidents: currentIncidents.results,
    recentIncidents: recentIncidents.results,
    recentResults: recentResults.results,
    recentEvents: recentEvents.results,
    incidents24h: incidents24h?.count ?? 0,
    generatedAt: new Date().toISOString(),
  };
};

export const summarizeDashboard = (checks: CheckRow[], recentIncidents: IncidentRow[]) => {
  const totalChecks = checks.length;
  const okChecks = checks.filter((check) => check.last_state === "ok" && check.enabled === 1).length;
  const failedChecks = checks.filter((check) => check.last_state === "fail" && check.enabled === 1).length;
  const certExpiringSoonChecks = checks.filter(
    (check) => typeof check.tls_days_remaining === "number" && check.tls_days_remaining <= 30,
  ).length;
  const averageLatency =
    checks.length === 0
      ? null
      : Math.round(
          checks.reduce((sum, check) => sum + (check.last_latency_ms ?? 0), 0) /
            Math.max(1, checks.filter((check) => check.last_latency_ms !== null).length || 1),
        );

  return {
    totalChecks,
    okChecks,
    failedChecks,
    certExpiringSoonChecks,
    incidents24h: recentIncidents.length,
    averageLatencyMs: checks.some((check) => check.last_latency_ms !== null) ? averageLatency : null,
  };
};
