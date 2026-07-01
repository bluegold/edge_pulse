import type { DurableObjectNamespace } from "./cloudflare";
import type { CheckJob } from "./checks";
import type { CertProbeContainer } from "./cert-probe-container";

export type Bindings = {
  "pulse-db": import("./cloudflare").D1Database;
  "pulse-queue": { send(message: CheckJob): Promise<void> };
  CertProbeContainer?: DurableObjectNamespace<CertProbeContainer>;
  CERT_PROBE_CONTAINER?: DurableObjectNamespace<CertProbeContainer>;
  ASSETS: import("./cloudflare").Fetcher;
  ADMIN_API_TOKEN: string;
};
