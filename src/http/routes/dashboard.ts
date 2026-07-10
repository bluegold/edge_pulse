import { Hono } from "hono";
import { handleDashboardRequest } from "../../controllers/dashboard";

const dashboard = new Hono<{ Bindings: Env }>();

dashboard.get("/", ...handleDashboardRequest);

export { dashboard };
