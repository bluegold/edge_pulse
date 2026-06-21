export {};

declare global {
  interface Env {
    "pulse-db": import("./lib/cloudflare").D1Database;
    "pulse-queue": import("./lib/cloudflare").Queue<import("./lib/checks").CheckJob>;
  }
}
