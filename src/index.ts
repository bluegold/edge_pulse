import { CertProbeContainer } from "./lib/cert-probe-container";
import type { CheckJob } from "./lib/checks";
import { app } from "./http/route";
import { handleScheduled, runCheck } from "./services/check-execution";

export { app };
export { CertProbeContainer };

export default {
  fetch: app.fetch.bind(app),
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env);
  },
  async queue(batch: MessageBatch<CheckJob>, env: Env, _ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      if (!message?.body) continue;
      await runCheck(env, message.body, _ctx);
    }
  },
} satisfies ExportedHandler<Env, CheckJob>;
