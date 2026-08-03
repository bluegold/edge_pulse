import { CertProbeContainer } from "./lib/cert-probe-container";
import type { CheckJob } from "./lib/checks";
import { app } from "./http/route";
import { handleScheduled, runCheck } from "./services/check-execution";
import { GroupDurableObject } from "./durable-objects/group";
import { publishGroupUpdated } from "./realtime/events";

export { app };
export { CertProbeContainer };
export { GroupDurableObject };

export default {
  fetch: app.fetch.bind(app),
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env);
  },
  async queue(batch: MessageBatch<CheckJob>, env: Env, ctx: ExecutionContext): Promise<void> {
    const groupIds = new Set(
      await Promise.all(
        batch.messages
          .filter((message) => Boolean(message?.body))
          .map((message) => runCheck(env, message.body, ctx)),
      ),
    );
    const occurredAt = new Date().toISOString();

    await Promise.all(
      [...groupIds]
        .filter((groupId): groupId is number => typeof groupId === "number")
        .map(async (groupId) => {
          try {
            await publishGroupUpdated(env, groupId, `queue:${crypto.randomUUID()}:${groupId}`, "check.updated", occurredAt);
          } catch (error) {
            console.error(JSON.stringify({ message: "queue group update publish failed", groupId, error: String(error) }));
          }
        }),
    );
  },
} satisfies ExportedHandler<Env, CheckJob>;
