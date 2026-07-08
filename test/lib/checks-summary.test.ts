import { describe, expect, it } from "vitest";
import { summarizeChecks } from "../../src/lib/checks-summary";

describe("summarizeChecks", () => {
  it("counts enabled ok, enabled fail, and disabled checks consistently", () => {
    const summary = summarizeChecks([
      { id: 1, enabled: 1, last_state: "ok" } as never,
      { id: 2, enabled: 1, last_state: "fail" } as never,
      { id: 3, enabled: 0, last_state: "ok" } as never,
      { id: 4, enabled: 0, last_state: "fail" } as never,
    ]);

    expect(summary).toEqual({
      totalChecks: 4,
      okChecks: 1,
      failedChecks: 1,
      stoppedChecks: 2,
    });
  });
});
