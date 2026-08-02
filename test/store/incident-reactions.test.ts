import { describe, expect, it } from "vitest";
import { INCIDENT_REACTIONS, isIncidentReactionKey, loadIncidentReactions, toggleIncidentReaction } from "../../src/store/incident-reactions";

describe("incident reactions", () => {
  it("accepts only the configured reaction keys", () => {
    expect(INCIDENT_REACTIONS.map((reaction) => reaction.key)).toEqual(["investigating", "responding", "acknowledged"]);
    expect(isIncidentReactionKey("responding")).toBe(true);
    expect(isIncidentReactionKey("unknown")).toBe(false);
  });

  it("loads counts and whether the current user reacted", async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: [{ incident_id: 10, reaction_key: "responding", count: 2, reacted: 1 }] };
          },
        };
      },
    } as unknown as D1Database;

    const summaries = (await loadIncidentReactions(db, [10], 7)).get(10) ?? [];

    expect(summaries.find((reaction) => reaction.key === "responding")).toMatchObject({ count: 2, reacted: true });
    expect(summaries.find((reaction) => reaction.key === "investigating")).toMatchObject({ count: 0, reacted: false });
  });

  it("removes an existing user reaction", async () => {
    const batches: unknown[][] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first() {
            return sql.includes("SELECT id FROM incident_reactions") ? { id: 3 } : null;
          },
        };
      },
      async batch(statements: unknown[]) {
        batches.push(statements);
        return [];
      },
    } as unknown as D1Database;

    await expect(toggleIncidentReaction(db, 10, 7, "responding", "2026-08-02T00:00:00.000Z")).resolves.toBe(false);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });
});
