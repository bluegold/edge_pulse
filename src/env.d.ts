export {};

declare global {
  interface Env {
    "pulse-db": import("./lib/cloudflare").D1Database;
    "pulse-queue": import("./lib/cloudflare").Queue<import("./lib/checks").CheckJob>;
    CertProbeContainer?: import("./lib/cloudflare").DurableObjectNamespace<
      import("./lib/cert-probe-container").CertProbeContainer
    >;
    CERT_PROBE_CONTAINER?: import("./lib/cloudflare").DurableObjectNamespace<
      import("./lib/cert-probe-container").CertProbeContainer
    >;
    ADMIN_API_TOKEN: string;
  }
}
