import type { CheckResult, CheckRow, TransitionChange } from "../lib/checks";
import { toErrorMessage } from "../lib/error-message";
import { readNotificationSecrets, type SecretEnv } from "../lib/secrets";

type NotificationTarget = {
  kind: "webhook" | "discord";
  url: string;
};

type NotificationSecrets = Pick<
  SecretEnv,
  "DISCORD_WEBHOOK_URL" | "DISCORD_WEBHOOK_URLS" | "WEBHOOK_URL" | "WEBHOOK_URLS" | "NOTIFICATION_SOURCE"
>;

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

const normalizeTargetUrl = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return value.trim();
  }
};

const getNotificationTargets = (env: NotificationSecrets): NotificationTarget[] => {
  const secrets = readNotificationSecrets(env);
  const webhookUrls = collectUrls(secrets.webhookUrl, secrets.webhookUrls);
  const discordUrls = collectUrls(secrets.discordWebhookUrl, secrets.discordWebhookUrls);
  const targets = new Map<string, NotificationTarget>();

  for (const url of webhookUrls) {
    targets.set(normalizeTargetUrl(url), { kind: "webhook", url });
  }

  for (const url of discordUrls) {
    targets.set(normalizeTargetUrl(url), { kind: "discord", url });
  }

  return Array.from(targets.values());
};

const getNotificationSource = (env: NotificationSecrets): string | null => {
  return readNotificationSecrets(env).notificationSource;
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

const buildWebhookPayload = (
  { check, result, transition }: NotificationContext,
  notificationSource: string | null,
) => ({
  event: transition.kind,
  source: notificationSource,
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

const buildDiscordPayload = (
  { check, result, transition }: NotificationContext,
  notificationSource: string | null,
) => {
  const title = buildTitle(transition);
  const color = buildSeverity(transition) === "danger" ? 0xef4444 : 0x22c55e;
  const sourceLabel = notificationSource ? `[${notificationSource}] ` : "";

  return {
    content: `${sourceLabel}${title}: ${check.name}`,
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
          ...(notificationSource ? [{ name: "通知元", value: notificationSource, inline: true }] : []),
          { name: "URL", value: check.url, inline: false },
        ],
      },
    ],
  };
};

const buildTestWebhookPayload = (context: TestNotificationContext, notificationSource: string | null) => ({
  event: "test",
  source: notificationSource,
  message: context.message,
  sentAt: context.sentAt,
});

const buildTestDiscordPayload = (context: TestNotificationContext, notificationSource: string | null) => ({
  content: `${notificationSource ? `[${notificationSource}] ` : ""}${context.title}: ${context.message}`,
  allowed_mentions: { parse: [] as string[] },
  embeds: [
    {
      title: context.title,
      color: context.severity === "danger" ? 0xef4444 : 0x22c55e,
      timestamp: context.sentAt,
      fields: [
        ...(notificationSource ? [{ name: "通知元", value: notificationSource, inline: true }] : []),
        { name: "メッセージ", value: context.message, inline: false },
      ],
    },
  ],
});

const postNotification = async (
  target: NotificationTarget,
  context: NotificationContext,
  notificationSource: string | null,
): Promise<void> => {
  const payload = target.kind === "discord"
    ? buildDiscordPayload(context, notificationSource)
    : buildWebhookPayload(context, notificationSource);
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

export const dispatchNotifications = async (
  env: NotificationSecrets,
  context: NotificationContext,
): Promise<void> => {
  const targets = getNotificationTargets(env);
  if (targets.length === 0) return;
  const notificationSource = getNotificationSource(env);

  const results = await Promise.allSettled(targets.map((target) => postNotification(target, context, notificationSource)));
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  if (rejected.length > 0) {
    console.error(JSON.stringify({
      message: "notification delivery failed",
      errors: rejected.map((result) => toErrorMessage(result.reason)),
      targetCount: targets.length,
      checkId: context.check.id,
      transition: context.transition.kind,
    }));
  }
};

export const dispatchTestNotifications = async (
  env: NotificationSecrets,
  context: TestNotificationContext,
): Promise<number> => {
  const targets = getNotificationTargets(env);
  if (targets.length === 0) return 0;
  const notificationSource = getNotificationSource(env);

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const payload = target.kind === "discord"
        ? buildTestDiscordPayload(context, notificationSource)
        : buildTestWebhookPayload(context, notificationSource);
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
    console.error(JSON.stringify({
      message: "notification test delivery failed",
      errors: rejected.map((result) => toErrorMessage(result.reason)),
      targetCount: targets.length,
      sentAt: context.sentAt,
    }));
  }

  return results.length - rejected.length;
};
