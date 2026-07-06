import type { ServerTimingEntry } from "./http-timing";
import ipaddr from "ipaddr.js";

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

const TLS_ERROR_PATTERNS = [
  /certificate/i,
  /tls/i,
  /ssl/i,
  /x509/i,
  /handshake/i,
  /expired/i,
  /cert/i,
];

const DNS_ERROR_PATTERNS = [/dns/i, /nxdomain/i, /getaddrinfo/i, /enotfound/i, /eai_again/i];

const TIMEOUT_ERROR_PATTERNS = [/timeout/i, /timed out/i, /aborted/i, /abort/i];

const isSpecialUseHost = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase();
  const withoutTrailingDot = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
  const stripped =
    withoutTrailingDot.startsWith("[") && withoutTrailingDot.endsWith("]")
      ? withoutTrailingDot.slice(1, -1)
      : withoutTrailingDot;

  if (stripped === "localhost" || stripped.endsWith(".localhost")) {
    return true;
  }

  if (!ipaddr.isValid(stripped)) {
    return false;
  }

  const parsed = ipaddr.parse(stripped);
  if (parsed.kind() === "ipv4") {
    return parsed.range() !== "unicast";
  }

  const ipv6 = parsed as ipaddr.IPv6;
  if (ipv6.range() === "ipv4Mapped") {
    return ipv6.toIPv4Address().range() !== "unicast";
  }

  return ipv6.range() !== "unicast";
};

export const classifyCheckFailureReason = (statusCode: number | null, error: string | null): string => {
  if (statusCode === 526) return "tls_error";

  const message = `${statusCode ?? ""} ${error ?? ""}`;
  if (TLS_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "tls_error";
  if (TIMEOUT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "timeout";
  if (DNS_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return "dns_error";
  return "fetch_error";
};

export const isCertificateExpiringSoon = (daysRemaining: number | null, thresholdDays = 30): boolean => {
  return daysRemaining !== null && daysRemaining <= thresholdDays;
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

const normalizeHostname = (hostname: string): string => {
  const trimmed = hostname.trim().toLowerCase();
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};
export const validateMonitorUrl = (
  input: string,
): { ok: true; url: URL } | { ok: false; error: string } => {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: "URL の形式が不正です" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "http: / https: のみ許可されています" };
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    return { ok: false, error: "ホスト名が空です" };
  }

  // これは URL 文字列ベースの検証であり、DNS rebinding を完全には防げません。
  if (isSpecialUseHost(hostname)) {
    return { ok: false, error: "special-use address は許可されていません" };
  }

  return { ok: true, url };
};

export const validateCheckInput = (input: CheckInput): { ok: true } | { ok: false; error: string } => {
  if (!input.name.trim()) return { ok: false, error: "名称を入力してください" };
  const urlValidation = validateMonitorUrl(input.url);
  if (!urlValidation.ok) return urlValidation;
  if (input.expectedStatusMin > input.expectedStatusMax) {
    return { ok: false, error: "期待ステータス範囲が不正です" };
  }
  if (input.timeoutMs < 1000 || input.timeoutMs > 120000) {
    return { ok: false, error: "timeout は 1000〜120000ms で設定してください" };
  }
  if (input.intervalMinutes < 1 || input.intervalMinutes > 1440) {
    return { ok: false, error: "interval_minutes は 1〜1440 で設定してください" };
  }
  if (input.failThreshold < 1 || input.recoveryThreshold < 1) {
    return { ok: false, error: "threshold は 1 以上で設定してください" };
  }
  return { ok: true };
};

export const isMaintenanceWindowActive = (maintenanceEnabled: number | boolean | null | undefined): boolean => {
  return Boolean(maintenanceEnabled);
};

export const buildCheckResult = (
  params: {
    state: CheckResult["state"];
    statusCode: number | null;
    latencyMs: number | null;
    error: string | null;
    reason: string | null;
    checkedAt: string;
    xRuntimeMs?: number | null;
    serverTiming?: ServerTimingEntry[] | null;
  },
): CheckResult => ({
  state: params.state,
  statusCode: params.statusCode,
  latencyMs: params.latencyMs,
  error: params.error,
  reason: params.reason,
  checkedAt: params.checkedAt,
  xRuntimeMs: params.xRuntimeMs ?? null,
  serverTiming: params.serverTiming ?? null,
});

export const evaluateTransition = (
  check: CheckRow,
  result: CheckResult,
): EvaluatedCheck => {
  const nextCheck: CheckRow = { ...check };
  let transitionKind: TransitionChange["kind"] = "none";
  let transitionNextState: CheckState = check.last_state;
  let startedAt: string | undefined;
  let resolvedAt: string | undefined;

  nextCheck.last_checked_at = result.checkedAt;
  nextCheck.last_status_code = result.statusCode;
  nextCheck.last_latency_ms = result.latencyMs;
  nextCheck.last_error = result.error;
  nextCheck.updated_at = result.checkedAt;

  if (result.state === "ok") {
    nextCheck.consecutive_failures = 0;
    nextCheck.first_failure_at = null;

    if (check.last_state === "fail") {
      const consecutiveSuccesses = check.consecutive_successes + 1;
      nextCheck.consecutive_successes = consecutiveSuccesses;
      if (consecutiveSuccesses >= check.recovery_threshold) {
        nextCheck.last_state = "ok";
        nextCheck.consecutive_successes = 0;
        nextCheck.first_success_at = null;
        transitionKind = "incident-resolved";
        transitionNextState = "ok";
        resolvedAt = check.first_success_at ?? result.checkedAt;
      }
    } else if (check.last_state === "unknown") {
      nextCheck.last_state = "ok";
      nextCheck.consecutive_successes = 0;
      nextCheck.first_success_at = null;
      transitionNextState = "ok";
    } else {
      nextCheck.consecutive_successes = 0;
      nextCheck.first_success_at = null;
    }
  } else {
    nextCheck.consecutive_successes = 0;
    nextCheck.first_success_at = null;

    const consecutiveFailures = check.consecutive_failures + 1;
    nextCheck.consecutive_failures = consecutiveFailures;
    if (!check.first_failure_at) {
      nextCheck.first_failure_at = result.checkedAt;
    }

    if (check.last_state === "ok" || check.last_state === "unknown") {
      if (consecutiveFailures >= check.fail_threshold) {
        nextCheck.last_state = "fail";
        transitionKind = "incident-opened";
        transitionNextState = "fail";
        startedAt = nextCheck.first_failure_at ?? result.checkedAt;
      } else {
        transitionNextState = check.last_state;
      }
    } else if (check.last_state === "fail") {
      transitionNextState = "fail";
    }
  }

  const transition: TransitionChange =
    transitionKind === "incident-opened"
      ? { kind: "incident-opened", nextState: "fail", startedAt: startedAt ?? result.checkedAt }
      : transitionKind === "incident-resolved"
        ? { kind: "incident-resolved", nextState: "ok", resolvedAt: resolvedAt ?? result.checkedAt }
        : { kind: "none", nextState: transitionNextState };

  return { result, nextCheck, transition };
};

export const scheduleNextCheckAt = (nowIso: string, intervalMinutes: number): string => {
  const baseMs = intervalMinutes * 60_000;
  // Jitter of ±10% to prevent thundering herds and scatter execution times
  const jitterMs = Math.floor((Math.random() - 0.5) * 0.2 * baseMs);
  return new Date(new Date(nowIso).getTime() + baseMs + jitterMs).toISOString();
};

export const formatCheckUrlForDisplay = (value: string): string => value;
