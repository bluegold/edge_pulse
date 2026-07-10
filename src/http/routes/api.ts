import { Hono } from "hono";
import {
  handleApiCreateCheck,
  handleApiGetCheck,
  handleApiListChecks,
  handleApiUpdateCheck,
} from "../../controllers/checks";
import { handleApiTestNotifications } from "../../controllers/notifications";

const api = new Hono<{ Bindings: Env }>();
const checksApi = new Hono<{ Bindings: Env }>();
const notificationsApi = new Hono<{ Bindings: Env }>();

checksApi.get("/", ...handleApiListChecks);
checksApi.post("/", ...handleApiCreateCheck);
checksApi.get("/:id", ...handleApiGetCheck);
checksApi.patch("/:id", ...handleApiUpdateCheck);

notificationsApi.post("/test", ...handleApiTestNotifications);

api.route("/checks", checksApi);
api.route("/notifications", notificationsApi);

export { api };
