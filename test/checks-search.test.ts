import { describe, expect, it } from "vitest";
import {
  buildCheckSearchAttributes,
  evaluateCheckSearchFilter,
  matchesCheckTextQuery,
  parseCheckSearchFilter,
} from "../src/lib/checks-search";
import type { CheckRow } from "../src/lib/checks";

const check: CheckRow = {
  id: 1,
  name: "api-a",
  url: "https://api-a.example.com",
  method: "GET",
  enabled: 1,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: null,
  last_enqueued_at: null,
  last_checked_at: "2026-07-03T00:00:00.000Z",
  last_state: "ok",
  last_status_code: 200,
  last_latency_ms: 80,
  last_error: null,
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 0,
  consecutive_successes: 0,
  first_failure_at: null,
  first_success_at: null,
  tls_last_checked_at: null,
  tls_last_error: null,
  tls_subject: null,
  tls_issuer: null,
  tls_public_key_class: null,
  tls_valid_from: null,
  tls_valid_to: null,
  tls_days_remaining: 10,
  tls_dns_names: null,
  maintenance_enabled: 0,
  created_at: "2026-07-03T00:00:00.000Z",
  updated_at: "2026-07-03T00:00:00.000Z",
};

describe("checks search filter", () => {
  it("evaluates LDAP-like filters", () => {
    const filter = parseCheckSearchFilter("(&(enabled=1)(last_state=ok)(|(name=api*)(recent_incident_24h=1)))");
    expect(filter).not.toBeNull();
    expect(evaluateCheckSearchFilter(filter!, buildCheckSearchAttributes(check, false))).toBe(true);
  });

  it("supports q text matching", () => {
    expect(matchesCheckTextQuery(check, "api https")).toBe(true);
    expect(matchesCheckTextQuery(check, "api fail")).toBe(false);
  });

  it("rejects approx filters", () => {
    expect(() => parseCheckSearchFilter("(name~=api)")).toThrow("approx 演算子 (~=) は未対応です");
  });
});
