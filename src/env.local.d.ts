export {};

declare global {
  interface Env {
    WEBHOOK_URL?: string;
    WEBHOOK_URLS?: string;
    DISCORD_WEBHOOK_URLS?: string;
  }
}
