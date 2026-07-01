import { describe, expect, it } from "vitest";
import { loadChecksPageData } from "../../src/store/checks";
import type { D1Database } from "../../src/lib/cloudflare";

const makeDb = (rows: { count: number; checks: Array<Record<string, unknown>> }): D1Database => ({
  prepare(sql: string) {
    const normalized = sql.replaceAll(/\s+/g, " ").trim();
    return {
      bind(...args: unknown[]) {
        return this;
      },
      async first<T>() {
        if (normalized === "SELECT COUNT(*) AS count FROM checks") {
          return { count: rows.count } as T;
        }
        return null as T;
      },
      async all<T>() {
        if (normalized.includes("FROM checks ORDER BY created_at DESC, id DESC")) {
          return { results: rows.checks } as T;
        }
        return { results: [] } as T;
      },
      async run() {
        return {};
      },
    } as unknown as ReturnType<D1Database["prepare"]>;
  },
  async batch() {
    return [];
  },
});

describe("loadChecksPageData", () => {
  it("normalizes page numbers and returns checks", async () => {
    const data = await loadChecksPageData(
      makeDb({
        count: 42,
        checks: [{ id: 1, name: "api", last_state: "ok" }],
      }),
      0,
      2,
      3,
    );

    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(20);
    expect(data.totalChecks).toBe(42);
    expect(data.totalPages).toBe(3);
    expect(data.editId).toBe(2);
    expect(data.highlightId).toBe(3);
    expect(data.checks).toHaveLength(1);
  });
});
