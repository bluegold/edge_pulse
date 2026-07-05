import { describe, expect, it, vi } from "vitest";
import { dispatchNotifications } from "../../src/services/notifications";
import type { CheckRow } from "../../src/lib/checks";

const check: CheckRow = {
  id: 1,
  name: "api",
  url: "https://api.example.com",
  method: "GET",
  enabled: 1,
  expected_status_min: 200,
  expected_status_max: 399,
  timeout_ms: 10_000,
  interval_minutes: 5,
  next_check_at: null,
  last_enqueued_at: null,
  last_checked_at: "2026-06-22T00:00:00.000Z",
  last_state: "fail",
  last_status_code: 500,
  last_latency_ms: 456,
  last_error: "HTTP 500",
  fail_threshold: 2,
  recovery_threshold: 1,
  consecutive_failures: 2,
  consecutive_successes: 0,
  first_failure_at: "2026-06-22T00:00:00.000Z",
  first_success_at: null,
  created_at: "2026-06-22T00:00:00.000Z",
  updated_at: "2026-06-22T00:00:00.000Z",
};

const result = {
  state: "fail" as const,
  statusCode: 500,
  latencyMs: 456,
  error: "HTTP 500",
  reason: "http_status",
  checkedAt: "2026-06-22T00:01:00.000Z",
};

describe("dispatchNotifications", () => {
  it("sends webhook and discord notifications to every configured endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await dispatchNotifications(
      {
        WEBHOOK_URLS: "https://hooks.example.com/a, https://hooks.example.com/b",
        DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/2",
        DISCORD_WEBHOOK_URLS: "https://discord.com/api/webhooks/3/4",
      } as never,
      {
        check,
        result,
        transition: {
          kind: "incident-opened",
          nextState: "fail",
          startedAt: "2026-06-22T00:00:00.000Z",
        },
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      "https://hooks.example.com/a",
      "https://hooks.example.com/b",
      "https://discord.com/api/webhooks/1/2",
      "https://discord.com/api/webhooks/3/4",
    ]);

    const webhookPayload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(webhookPayload).toMatchObject({
      event: "incident-opened",
      check: {
        id: 1,
        name: "api",
        url: "https://api.example.com",
      },
      state: {
        from: "fail",
        to: "fail",
      },
      result: {
        statusCode: 500,
        latencyMs: 456,
        error: "HTTP 500",
        reason: "http_status",
      },
    });

    const discordPayload = JSON.parse(String(fetchSpy.mock.calls[2]?.[1]?.body));
    expect(discordPayload).toMatchObject({
      content: "障害発生: api",
      allowed_mentions: { parse: [] },
    });
  });
});
