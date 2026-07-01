import { describe, expect, it } from "vitest";
import { formatNullable } from "../../src/presenters/common";
import { describeCertificateBadge, describeCheckState } from "../../src/presenters/checks";

describe("checks presenter", () => {
  it("describes check states", () => {
    expect(describeCheckState(0, "unknown")).toEqual({
      label: "停止中",
      className: "status off",
    });
    expect(describeCheckState(1, "ok")).toEqual({
      label: "OK",
      className: "status ok",
    });
    expect(describeCheckState(1, "fail")).toEqual({
      label: "障害中",
      className: "status off status-fail",
    });
    expect(describeCheckState(1, "unknown")).toEqual({
      label: "未確認",
      className: "status off",
    });
  });

  it("describes certificate badges", () => {
    expect(describeCertificateBadge({ tls_last_error: "error", tls_days_remaining: null, tls_valid_to: null })).toEqual({
      label: "未取得",
      className: "cert-chip warn",
    });
    expect(describeCertificateBadge({ tls_last_error: null, tls_days_remaining: 10, tls_valid_to: null })).toEqual({
      label: "要確認・10日",
      className: "cert-chip warn",
    });
    expect(describeCertificateBadge({ tls_last_error: null, tls_days_remaining: null, tls_valid_to: "2026-08-01T00:00:00.000Z" })).toEqual({
      label: "OK・-",
      className: "cert-chip",
    });
  });

  it("formats nullable values", () => {
    expect(formatNullable(null)).toBe("-");
    expect(formatNullable("", "N/A")).toBe("N/A");
    expect(formatNullable(0)).toBe("0");
  });
});
