import { describe, expect, it } from "vitest";
import { formatCertificateDays, formatDuration, describeRecentCheckState } from "../../src/presenters/dashboard";

describe("dashboard presenter", () => {
  it("describes recent check state badges", () => {
    expect(describeRecentCheckState({ enabled: 0, last_state: "unknown" })).toEqual({
      label: "停止中",
      className: "border-white/15 bg-white/8 text-slate-100",
    });
    expect(describeRecentCheckState({ enabled: 1, last_state: "ok" })).toEqual({
      label: "OK",
      className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    });
    expect(describeRecentCheckState({ enabled: 1, last_state: "fail" })).toEqual({
      label: "障害中",
      className: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    });
  });

  it("formats duration labels", () => {
    expect(formatDuration("2026-06-22T00:00:00.000Z", "2026-06-22T00:05:00.000Z")).toBe("5m");
    expect(formatDuration("2026-06-22T00:00:00.000Z", "2026-06-22T02:30:00.000Z")).toBe("2h 30m");
  });

  it("formats certificate age labels", () => {
    const now = "2026-07-03T00:00:00.000Z";

    expect(formatCertificateDays(null, now)).toBe("-");
    expect(formatCertificateDays("2026-07-13T00:00:00.000Z", now)).toBe("残り 10 日");
    expect(formatCertificateDays("2026-06-30T00:00:00.000Z", now)).toBe("期限切れ 3 日前");
  });
});
