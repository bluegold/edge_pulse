export type SecretEnv = {
  ADMIN_API_TOKEN: string;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URLS?: string;
  WEBHOOK_URL?: string;
  WEBHOOK_URLS?: string;
};

export const readAdminApiToken = (env: Pick<SecretEnv, "ADMIN_API_TOKEN">): string => {
  return env.ADMIN_API_TOKEN.trim();
};

export const readNotificationSecrets = (
  env: Pick<SecretEnv, "DISCORD_WEBHOOK_URL" | "DISCORD_WEBHOOK_URLS" | "WEBHOOK_URL" | "WEBHOOK_URLS">,
) => {
  return {
    webhookUrl: env.WEBHOOK_URL,
    webhookUrls: env.WEBHOOK_URLS,
    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    discordWebhookUrls: env.DISCORD_WEBHOOK_URLS,
  };
};
