import { describe, expect, it } from "vitest";
import { authenticateApiToken, hashApiToken } from "../../src/store/api-tokens";

describe("api tokens", () => {
  it("hashes the same token deterministically", async () => {
    const first = await hashApiToken("ep_example");
    const second = await hashApiToken("ep_example");

    expect(first).toBe(second);
    expect(first).not.toContain("=");
    expect(first).not.toContain("+");
    expect(first).not.toContain("/");
  });

  it("authenticates an active token with the user's memberships", async () => {
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            if (sql.includes("FROM api_tokens")) {
              return {
                id: 7,
                user_id: 3,
                expires_at: null,
                identity_provider: "cloudflare-access",
                identity_subject: "subject-3",
                display_name: "User 3",
                email: "user3@example.com",
                role: "member",
              };
            }
            return null;
          },
          async run() {
            return { meta: { changes: 1 } };
          },
          async all() {
            return { results: [{ group_id: 2 }, { group_id: 5 }] };
          },
        };
      },
    } as unknown as D1Database;

    const user = await authenticateApiToken(db, "ep_example", "2026-08-02T00:00:00.000Z");

    expect(user).toMatchObject({
      id: 3,
      identitySubject: "subject-3",
      role: "member",
      groupIds: [2, 5],
    });
    expect(statements).toHaveLength(3);
  });

  it("rejects an expired token before updating last_used_at", async () => {
    let updateCalled = false;
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first() {
            return sql.includes("FROM api_tokens")
              ? {
                  id: 7,
                  user_id: 3,
                  expires_at: "2026-08-01T00:00:00.000Z",
                  identity_provider: "cloudflare-access",
                  identity_subject: "subject-3",
                  display_name: "User 3",
                  email: null,
                  role: "member",
                }
              : null;
          },
          async run() {
            updateCalled = true;
            return { meta: { changes: 1 } };
          },
        };
      },
    } as unknown as D1Database;

    await expect(authenticateApiToken(db, "ep_example", "2026-08-02T00:00:00.000Z")).resolves.toBeNull();
    expect(updateCalled).toBe(false);
  });
});
