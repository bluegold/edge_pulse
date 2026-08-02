import { createFactory } from "hono/factory";
import type { AppEnv } from "../auth/types";
import { visibleGroupIds } from "../auth/authorization";
import { respondHtml, respondJson } from "../http/shared";
import { readJsonWithLimit } from "../lib/json-body";
import { getIncidentGroupId, isIncidentReactionKey, loadIncidentReactionDetails, loadIncidentReactions, toggleIncidentReaction } from "../store/incident-reactions";
import { publishGroupUpdated } from "../realtime/events";
import { renderIncidentReactions } from "../views/dashboard-page.tsx";
import { toErrorMessage } from "../lib/error-message";

const factory = createFactory<AppEnv>();

const isApiRequest = (request: Request): boolean => new URL(request.url).pathname.startsWith("/api/");

export const handleToggleIncidentReaction = factory.createHandlers(async (c) => {
  const user = c.get("user");
  const incidentId = Number(c.req.param("id"));
  if (!Number.isInteger(incidentId) || incidentId < 1) return isApiRequest(c.req.raw) ? respondJson({ error: "invalid_incident" }, 400) : respondHtml("<div id=\"content\" role=\"alert\">incident の指定が不正です。</div>", 400);

  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  const reactionKey = contentType.includes("application/json")
    ? String((await readJsonWithLimit<{ reaction_key?: unknown }>(c.req.raw)).reaction_key ?? "")
    : String((await c.req.raw.formData()).get("reaction_key") ?? "");
  if (!isIncidentReactionKey(reactionKey)) return isApiRequest(c.req.raw) ? respondJson({ error: "invalid_reaction" }, 400) : respondHtml("<div id=\"content\" role=\"alert\">reaction の指定が不正です。</div>", 400);

  const groupId = await getIncidentGroupId(c.env["pulse-db"], incidentId, visibleGroupIds(user));
  if (groupId === null) return isApiRequest(c.req.raw) ? respondJson({ error: "not_found" }, 404) : respondHtml("<div id=\"content\" role=\"alert\">incident が見つかりません。</div>", 404);

  const now = new Date().toISOString();
  try {
    const active = await toggleIncidentReaction(c.env["pulse-db"], incidentId, user.id, reactionKey, now);
    const summaries = (await loadIncidentReactions(c.env["pulse-db"], [incidentId], user.id)).get(incidentId) ?? [];
    const reactionActors = (await loadIncidentReactionDetails(c.env["pulse-db"], [incidentId])).get(incidentId)?.current ?? [];
    try {
      await publishGroupUpdated(c.env, groupId, `incident-reaction:${incidentId}:${user.id}:${reactionKey}:${now}`, "incident.reaction_changed", now);
    } catch (error) {
      console.error(JSON.stringify({ message: "incident reaction publish failed", error: toErrorMessage(error) }));
    }
    if (isApiRequest(c.req.raw)) return respondJson({ incidentId, reactionKey, active, reactions: summaries });
    return respondHtml(renderIncidentReactions(incidentId, summaries, reactionActors));
  } catch (error) {
    console.error(JSON.stringify({ message: "incident reaction failed", error: toErrorMessage(error) }));
    return isApiRequest(c.req.raw) ? respondJson({ error: "reaction_failed" }, 500) : respondHtml("<div id=\"content\" role=\"alert\">reaction の更新に失敗しました。</div>", 500);
  }
});
