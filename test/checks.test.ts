import { describe, expect, it } from "vitest";
import {
  classifyCheckFailureReason,
  evaluateTransition,
  isCertificateExpiringSoon,
  validateCheckInput,
  validateMonitorUrl,
  type CheckInput,
  type CheckRow,
  type CheckResult,
} from "../src/lib/checks";
import { shouldProbeCertificateSnapshot } from "../src/lib/cert-probe";

const baseCheck: CheckRow = {
  id: 1,
  name: "api",
  url: "https://api.example.com",
  method: "GET",
  enabled: 1,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: null,
  last_enqueued_at: null,
  last_checked_at: null,
  last_state: "unknown",
  last_status_code: null,
  last_latency_ms: null,
  last_error: null,
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 0,
  consecutive_successes: 0,
  first_failure_at: null,
  first_success_at: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

const okResult = (checkedAt = "2026-06-22T00:01:00.000Z"): CheckResult => ({
  state: "ok",
  statusCode: 200,
  latencyMs: 120,
  error: null,
  reason: "http_ok",
  checkedAt,
});

const failResult = (checkedAt = "2026-06-22T00:01:00.000Z"): CheckResult => ({
  state: "fail",
  statusCode: 500,
  latencyMs: null,
  error: "HTTP 500",
  reason: "http_status",
  checkedAt,
});

describe("validateMonitorUrl", () => {
  it("rejects localhost and private addresses", () => {
    expect(validateMonitorUrl("http://localhost")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("http://127.0.0.1")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("http://10.0.0.1")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("http://172.16.0.1")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("http://192.168.0.1")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("http://169.254.0.1")).toMatchObject({ ok: false });
  });

  it("rejects unsupported schemes", () => {
    expect(validateMonitorUrl("file:///tmp/a")).toMatchObject({ ok: false });
    expect(validateMonitorUrl("javascript:alert(1)")).toMatchObject({ ok: false });
  });
});

describe("validateCheckInput", () => {
  it("accepts a sane input", () => {
    const input: CheckInput = {
      name: "api",
      url: "https://api.example.com",
      method: "GET",
      enabled: true,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
      timeoutMs: 10_000,
      intervalMinutes: 5,
      failThreshold: 2,
      recoveryThreshold: 1,
    };

    expect(validateCheckInput(input)).toEqual({ ok: true });
  });
});

describe("classifyCheckFailureReason", () => {
  it("classifies tls, dns, timeout, and fallback errors", () => {
    expect(classifyCheckFailureReason(526, null)).toBe("tls_error");
    expect(classifyCheckFailureReason(null, "certificate has expired")).toBe("tls_error");
    expect(classifyCheckFailureReason(null, "getaddrinfo ENOTFOUND example.com")).toBe("dns_error");
    expect(classifyCheckFailureReason(null, "request timed out")).toBe("timeout");
    expect(classifyCheckFailureReason(null, "something else")).toBe("fetch_error");
  });
});

describe("isCertificateExpiringSoon", () => {
  it("treats 30 days or less as expiring soon", () => {
    expect(isCertificateExpiringSoon(30)).toBe(true);
    expect(isCertificateExpiringSoon(29)).toBe(true);
    expect(isCertificateExpiringSoon(31)).toBe(false);
    expect(isCertificateExpiringSoon(null)).toBe(false);
  });
});

describe("shouldProbeCertificateSnapshot", () => {
  it("probes immediately when there is no prior snapshot", () => {
    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "unknown",
          tls_last_checked_at: null,
          tls_last_error: null,
          tls_days_remaining: null,
        },
        "2026-06-22T00:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("refreshes slowly when the certificate is far from expiry", () => {
    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "ok",
          tls_last_checked_at: "2026-06-15T00:00:00.000Z",
          tls_last_error: null,
          tls_days_remaining: 90,
        },
        "2026-06-22T00:00:00.000Z",
      ),
    ).toBe(true);

    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "ok",
          tls_last_checked_at: "2026-06-16T00:00:00.000Z",
          tls_last_error: null,
          tls_days_remaining: 90,
        },
        "2026-06-22T00:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("refreshes daily when the certificate is within 30 days", () => {
    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "ok",
          tls_last_checked_at: "2026-06-21T01:00:00.000Z",
          tls_last_error: null,
          tls_days_remaining: 10,
        },
        "2026-06-22T00:00:00.000Z",
      ),
    ).toBe(false);

    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "ok",
          tls_last_checked_at: "2026-06-20T00:59:59.000Z",
          tls_last_error: null,
          tls_days_remaining: 10,
        },
        "2026-06-22T00:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("retries once after recovery when the previous snapshot failed", () => {
    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "ok",
          tls_last_checked_at: "2026-06-22T00:10:00.000Z",
          tls_last_error: "dial tcp: lookup example.com: no such host",
          tls_days_remaining: null,
        },
        "2026-06-22T01:00:00.000Z",
        "2026-06-22T00:30:00.000Z",
      ),
    ).toBe(true);
  });

  it("does not retry while the host is still down", () => {
    expect(
      shouldProbeCertificateSnapshot(
        {
          last_state: "fail",
          tls_last_checked_at: "2026-06-22T00:10:00.000Z",
          tls_last_error: "dial tcp: lookup example.com: no such host",
          tls_days_remaining: null,
        },
        "2026-06-22T01:00:00.000Z",
        "2026-06-22T00:30:00.000Z",
      ),
    ).toBe(false);
  });
});

describe("evaluateTransition", () => {
  it("moves unknown to ok on first success", () => {
    const transition = evaluateTransition(baseCheck, okResult());
    expect(transition.nextCheck.last_state).toBe("ok");
    expect(transition.transition.kind).toBe("none");
  });

  it("moves unknown to fail only after the failure threshold", () => {
    const onceFailed = evaluateTransition(baseCheck, failResult());
    expect(onceFailed.nextCheck.last_state).toBe("unknown");
    expect(onceFailed.nextCheck.consecutive_failures).toBe(1);

    const twiceFailed = evaluateTransition(
      { ...onceFailed.nextCheck, last_state: "unknown", first_failure_at: onceFailed.nextCheck.first_failure_at },
      failResult("2026-06-22T00:02:00.000Z"),
    );

    expect(twiceFailed.nextCheck.last_state).toBe("fail");
    expect(twiceFailed.transition.kind).toBe("incident-opened");
    expect(twiceFailed.transition).toMatchObject({
      kind: "incident-opened",
      startedAt: "2026-06-22T00:01:00.000Z",
    });
  });

  it("moves fail to ok after the recovery threshold", () => {
    const failed = {
      ...baseCheck,
      last_state: "fail" as const,
      consecutive_failures: 2,
      first_failure_at: "2026-06-22T00:00:00.000Z",
      consecutive_successes: 0,
    };

    const recovered = evaluateTransition(failed, okResult("2026-06-22T00:03:00.000Z"));
    expect(recovered.nextCheck.last_state).toBe("ok");
    expect(recovered.transition.kind).toBe("incident-resolved");
    expect(recovered.transition).toMatchObject({
      resolvedAt: "2026-06-22T00:03:00.000Z",
    });
  });

  it("keeps incident.started_at at first_failure_at", () => {
    const failed = {
      ...baseCheck,
      last_state: "unknown" as const,
      consecutive_failures: 1,
      first_failure_at: "2026-06-22T00:01:00.000Z",
    };

    const transition = evaluateTransition(failed, failResult("2026-06-22T00:02:00.000Z"));
    expect(transition.transition).toMatchObject({
      kind: "incident-opened",
      startedAt: "2026-06-22T00:01:00.000Z",
    });
  });
});
