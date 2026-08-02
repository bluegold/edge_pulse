import { describe, expect, it } from "vitest";
import { moveCheckToGroup } from "../../src/store/admin";

type RecordedStatement = {
  sql: string;
  params: unknown[];
};

describe("moveCheckToGroup", () => {
  it("updates the check and records an audit log", async () => {
    const statements: RecordedStatement[] = [];
    const db = {
      prepare(sql: string) {
        const statement = {
          bind(...params: unknown[]) {
            return { ...statement, sql, params };
          },
          params: [] as unknown[],
          async first<T>() {
            return { group_id: 1 } as T;
          },
        };
        return { ...statement, sql };
      },
      async batch(batch: Array<{ sql: string; params: unknown[] }>) {
        statements.push(...batch);
        return [];
      },
    } as unknown as D1Database;

    await moveCheckToGroup(db, 9, 3, 2);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      sql: "UPDATE checks SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [2, 3],
    });
    expect(statements[1]).toMatchObject({
      sql: "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?)",
      params: [9, "check.group_moved", "check", 3, JSON.stringify({ fromGroupId: 1, toGroupId: 2 })],
    });
  });
});
