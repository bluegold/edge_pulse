import { CertProbeContainer } from "./lib/cert-probe-container";
import type { Bindings } from "./lib/bindings";
import type { CheckJob } from "./lib/checks";
import type { ExecutionContext, MessageBatch, ScheduledController } from "./lib/cloudflare";
import { app } from "./http/route";
import { handleScheduled, runCheck } from "./services/check-execution";

export { app };
export { CertProbeContainer };

export default {
  fetch: app.fetch.bind(app),
  async scheduled(controller: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env);
  },
  async queue(batch: MessageBatch<CheckJob>, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      if (!message?.body) continue;
      await runCheck(env, message.body);
    }
  },
};
