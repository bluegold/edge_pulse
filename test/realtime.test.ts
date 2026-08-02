import { describe, expect, it } from "vitest";
import { publishGroupUpdated, type GroupUpdatedEvent } from "../src/realtime/events";

describe("publishGroupUpdated", () => {
  it("publishes a group refresh event to the deterministic group stub", async () => {
    let name = "";
    let event: GroupUpdatedEvent | null = null;
    const env = {
      GROUPS: {
        getByName(nextName: string) {
          name = nextName;
          return {
            async publish(nextEvent: GroupUpdatedEvent) {
              event = nextEvent;
            },
          };
        },
      },
    } as unknown as Env;

    await publishGroupUpdated(env, 10, "check-run:42", "check.status_changed", "2026-08-02T00:00:00.000Z");

    expect(name).toBe("group:10");
    expect(event).toEqual({
      type: "group.updated",
      eventId: "check-run:42",
      groupId: 10,
      reason: "check.status_changed",
      occurredAt: "2026-08-02T00:00:00.000Z",
    });
  });
});
