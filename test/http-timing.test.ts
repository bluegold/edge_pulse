import { describe, expect, it } from "vitest";
import { parseServerTimingHeader, parseXRuntimeHeader, resolveXRuntimeMs } from "../src/lib/http-timing";

describe("parseXRuntimeHeader", () => {
  it("normalizes runtime values to milliseconds", () => {
    expect(parseXRuntimeHeader("0.98")).toBe(980);
    expect(parseXRuntimeHeader("534")).toBe(534);
    expect(parseXRuntimeHeader("0.87s")).toBe(870);
    expect(parseXRuntimeHeader("443ms")).toBe(443);
    expect(parseXRuntimeHeader(" 1.2 s ")).toBe(1200);
    expect(parseXRuntimeHeader(null)).toBeNull();
  });
});

describe("parseServerTimingHeader", () => {
  it("parses server timing metrics into structured entries", () => {
    expect(
      parseServerTimingHeader('total;desc="UsersController#index";dur=17.167, db;dur=0.5440000677481294, view;dur=15.272999997250736'),
    ).toEqual([
      {
        name: "total",
        description: "UsersController#index",
        durationMs: 17.167,
        parameters: {
          desc: "UsersController#index",
          dur: 17.167,
        },
      },
      {
        name: "db",
        description: null,
        durationMs: 0.5440000677481294,
        parameters: {
          dur: 0.5440000677481294,
        },
      },
      {
        name: "view",
        description: null,
        durationMs: 15.272999997250736,
        parameters: {
          dur: 15.272999997250736,
        },
      },
    ]);
    expect(parseServerTimingHeader("")).toBeNull();
  });
});

describe("resolveXRuntimeMs", () => {
  it("prefers X-Runtime and falls back to the total server timing duration", () => {
    const serverTiming = parseServerTimingHeader(
      'total;desc="UsersController#index";dur=17.167, db;dur=0.5440000677481294',
    );

    expect(resolveXRuntimeMs("0.98", serverTiming)).toBe(980);
    expect(resolveXRuntimeMs(null, serverTiming)).toBe(17.167);
    expect(resolveXRuntimeMs(undefined, serverTiming)).toBe(17.167);
    expect(resolveXRuntimeMs(null, parseServerTimingHeader("db;dur=0.5440000677481294"))).toBe(0.5440000677481294);
    expect(resolveXRuntimeMs(null, null)).toBeNull();
  });
});
