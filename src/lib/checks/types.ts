import type { ServerTimingEntry } from "../http-timing";

export type CheckState = "unknown" | "ok" | "fail";
export type CheckRunResultState = "ok" | "fail" | "skipped";

export type CheckRunClaim =
  | { kind: "claimed"; run: CheckRunRow }
  | { kind: "finished" }
  | { kind: "leased"; leaseUntil: string }
  | { kind: "missing" };

export type CheckJob = {
  checkId: number;
  scheduledAt: string;
  attemptId: string;
};

export type CheckRunRow = {
  id: number;
  check_id: number;
  attempt_id: string;
  scheduled_at: string;
  started_at: string | null;
  lease_until: string | null;
  finished_at: string | null;
  result_state: CheckRunResultState | null;
  skip_reason: string | null;
  dispatched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UndispatchedCheckRunRow = CheckRunRow & {
  interval_minutes: number;
};

export type CheckResult = {
  state: "ok" | "fail";
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  reason: string | null;
  checkedAt: string;
  xRuntimeMs?: number | null;
  serverTiming?: ServerTimingEntry[] | null;
};

export type CertificateSnapshot = {
  checkedAt: string;
  subject: string | null;
  issuer: string | null;
  publicKeyClass: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  dnsNames: string[] | null;
  error: string | null;
};

export type CheckRow = {
  id: number;
  name: string;
  url: string;
  method: string;
  enabled: number;
  expected_status_min: number;
  expected_status_max: number;
  timeout_ms: number;
  interval_minutes: number;
  next_check_at: string | null;
  last_enqueued_at: string | null;
  last_checked_at: string | null;
  last_state: CheckState;
  last_status_code: number | null;
  last_latency_ms: number | null;
  last_runtime_ms?: number | null;
  last_error: string | null;
  fail_threshold: number;
  recovery_threshold: number;
  consecutive_failures: number;
  consecutive_successes: number;
  first_failure_at: string | null;
  first_success_at: string | null;
  tls_last_checked_at?: string | null;
  tls_last_error?: string | null;
  tls_subject?: string | null;
  tls_issuer?: string | null;
  tls_public_key_class?: string | null;
  tls_valid_from?: string | null;
  tls_valid_to?: string | null;
  tls_days_remaining?: number | null;
  tls_dns_names?: string | null;
  maintenance_enabled?: number | null;
  created_at: string;
  updated_at: string;
};

export type CheckInput = {
  name: string;
  url: string;
  method: string;
  enabled: boolean;
  expectedStatusMin: number;
  expectedStatusMax: number;
  timeoutMs: number;
  intervalMinutes: number;
  failThreshold: number;
  recoveryThreshold: number;
  maintenanceEnabled: boolean;
};

export type TransitionChange =
  | {
      kind: "none";
      nextState: CheckState;
    }
  | {
      kind: "state-initialized";
      nextState: "ok";
    }
  | {
      kind: "incident-opened";
      nextState: "fail";
      startedAt: string;
    }
  | {
      kind: "incident-resolved";
      nextState: "ok";
      resolvedAt: string;
    };

export type EvaluatedCheck = {
  result: CheckResult;
  nextCheck: CheckRow;
  transition: TransitionChange;
};
