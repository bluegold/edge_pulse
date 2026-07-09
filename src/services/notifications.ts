import type { CheckResult, CheckRow, TransitionChange } from "../lib/checks";

type NotificationTarget = {
  kind: "webhook" | "discord";
  url: string;
};

type NotificationContext = {
  check: CheckRow;
  result: CheckResult;
  transition: Extract<TransitionChange, { kind: "incident-opened" | "incident-resolved" }>;
};

type TestNotificationContext = {
  title: string;
  message: string;
  severity: "danger" | "good";
  sentAt: string;
};

const splitList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const collectUrls = (...values: Array<string | undefined>): string[] => Array.from(new Set(values.flatMap(splitList)));

const getNotificationTargets = (env: Env): NotificationTarget[] => {
  const webhookUrls = collectUrls(env.WEBHOOK_URL, env.WEBHOOK_URLS);
  const discordUrls = collectUrls(env.DISCORD_WEBHOOK_URL, env.DISCORD_WEBHOOK_URLS);

  return [
    ...webhookUrls.map((url) => ({ kind: "webhook" as const, url })),
    ...discordUrls.map((url) => ({ kind: "discord" as const, url })),
  ];
};

const buildTitle = (transition: NotificationContext["transition"] | TestNotificationContext): string => {
  if ("title" in transition) return transition.title;
  if (transition.kind === "incident-opened") return "障害発生";
  return "復旧";
};

const buildSeverity = (transition: NotificationContext["transition"] | TestNotificationContext): "danger" | "good" => {
  if ("severity" in transition) return transition.severity;
  return transition.kind === "incident-opened" ? "danger" : "good";
};

const buildWebhookPayload = ({ check, result, transition }: NotificationContext) => ({
  event: transition.kind,
  check: {
    id: check.id,
    name: check.name,
    url: check.url,
    method: check.method,
  },
  state: {
    from: check.last_state,
    to: transition.nextState,
  },
  result: {
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    error: result.error,
    reason: result.reason,
    checkedAt: result.checkedAt,
  },
  incident:
    transition.kind === "incident-opened"
      ? {
          startedAt: transition.startedAt,
        }
      : {
          resolvedAt: transition.resolvedAt,
        },
});

const buildDiscordPayload = ({ check, result, transition }: NotificationContext) => {
  const title = buildTitle(transition);
  const color = buildSeverity(transition) === "danger" ? 0xef4444 : 0x22c55e;

  return {
    content: `${title}: ${check.name}`,
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title,
        url: check.url,
        color,
        timestamp: result.checkedAt,
        fields: [
          { name: "監視対象", value: check.name, inline: true },
          { name: "状態", value: `${check.last_state} → ${transition.nextState}`, inline: true },
          { name: "理由", value: result.reason ?? "-", inline: false },
          { name: "HTTP", value: result.statusCode === null ? "-" : String(result.statusCode), inline: true },
          { name: "応答時間", value: result.latencyMs === null ? "-" : `${result.latencyMs}ms`, inline: true },
          { name: "URL", value: check.url, inline: false },
        ],
      },
    ],
  };
};

const buildTestWebhookPayload = (context: TestNotificationContext) => ({
  event: "test",
  message: context.message,
  sentAt: context.sentAt,
});

const buildTestDiscordPayload = (context: TestNotificationContext) => ({
  content: `${context.title}: ${context.message}`,
  allowed_mentions: { parse: [] as string[] },
  embeds: [
    {
      title: context.title,
      color: context.severity === "danger" ? 0xef4444 : 0x22c55e,
      timestamp: context.sentAt,
      fields: [{ name: "メッセージ", value: context.message, inline: false }],
    },
  ],
});

const postNotification = async (target: NotificationTarget, context: NotificationContext): Promise<void> => {
  const payload = target.kind === "discord" ? buildDiscordPayload(context) : buildWebhookPayload(context);
  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "edge-pulse-notifications/1.0",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`notification delivery failed (${target.kind} ${response.status})`);
  }
};

export const dispatchNotifications = async (env: Env, context: NotificationContext): Promise<void> => {
  const targets = getNotificationTargets(env);
  if (targets.length === 0) return;

  const results = await Promise.allSettled(targets.map((target) => postNotification(target, context)));
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  if (rejected.length > 0) {
    console.error(
      "notification delivery failed",
      rejected.map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason))),
    );
  }
};

export const dispatchTestNotifications = async (env: Env, context: TestNotificationContext): Promise<number> => {
  const targets = getNotificationTargets(env);
  if (targets.length === 0) return 0;

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const payload = target.kind === "discord" ? buildTestDiscordPayload(context) : buildTestWebhookPayload(context);
      const response = await fetch(target.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "edge-pulse-notifications/1.0",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`notification delivery failed (${target.kind} ${response.status})`);
      }
    }),
  );

  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected.length > 0) {
    console.error(
      "notification test delivery failed",
      rejected.map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason))),
    );
  }

  return results.length - rejected.length;
};
