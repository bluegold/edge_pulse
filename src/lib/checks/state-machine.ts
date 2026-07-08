import type { ServerTimingEntry } from "../http-timing";
import type { CheckResult, CheckRow, EvaluatedCheck, TransitionChange, CheckState } from "./types";

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
      transitionKind = "state-initialized";
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
    transitionKind === "state-initialized"
      ? { kind: "state-initialized", nextState: "ok" }
      : transitionKind === "incident-opened"
        ? { kind: "incident-opened", nextState: "fail", startedAt: startedAt ?? result.checkedAt }
        : transitionKind === "incident-resolved"
        ? { kind: "incident-resolved", nextState: "ok", resolvedAt: resolvedAt ?? result.checkedAt }
        : { kind: "none", nextState: transitionNextState };

  return { result, nextCheck, transition };
};
