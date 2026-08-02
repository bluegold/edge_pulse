import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { AppEnv } from "../../auth/types";
import { handleToggleIncidentReaction } from "../../controllers/incident-reactions";

const incidentReactions = new Hono<AppEnv>();
incidentReactions.use("*", csrf());
incidentReactions.post("/:id/reactions", ...handleToggleIncidentReaction);

export { incidentReactions };
