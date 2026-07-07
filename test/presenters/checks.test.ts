import { describe, expect, it } from "vitest";
import { formatNullable } from "../../src/presenters/common";
import { describeCertificateBadge, describeCheckState, describeMaintenanceBadge } from "../../src/presenters/checks";

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
    const now = "2026-07-03T00:00:00.000Z";

    expect(describeCertificateBadge({ tls_last_error: "error", tls_valid_to: null }, now)).toEqual({
      label: "未取得",
      className: "cert-chip warn",
    });
    expect(describeCertificateBadge({ tls_last_error: null, tls_valid_to: "2026-07-13T00:00:00.000Z" }, now)).toEqual({
      label: "要確認・10日",
      className: "cert-chip warn",
    });
    expect(describeCertificateBadge({ tls_last_error: null, tls_valid_to: "2026-08-12T00:00:00.000Z" }, now)).toEqual({
      label: "OK・40日",
      className: "cert-chip",
    });
  });

  it("describes maintenance badges", () => {
    expect(describeMaintenanceBadge({ maintenance_enabled: 1 })).toEqual({
      label: "メンテ中",
      className: "status maintenance",
    });
    expect(describeMaintenanceBadge({ maintenance_enabled: 0 })).toBeNull();
  });

  it("formats nullable values", () => {
    expect(formatNullable(null)).toBe("-");
    expect(formatNullable("", "N/A")).toBe("N/A");
    expect(formatNullable(0)).toBe("0");
  });
});
