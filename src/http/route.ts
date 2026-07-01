import { app } from "./app";
import {
  handleApiCreateCheck,
  handleApiGetCheck,
  handleApiListChecks,
  handleApiUpdateCheck,
  handleChecksRequest,
  handleCreateCheck,
  handleUpdateCheck,
} from "../controllers/checks";
import { handleDashboardRequest } from "../controllers/dashboard";
import { requireApiToken } from "./shared";

app.use("/api/*", async (c, next) => {
  const tokenCheck = await requireApiToken(c.req.raw, c.env);
  if (tokenCheck) return tokenCheck;
  await next();
});

app.get("/", async (c) => handleDashboardRequest(c.req.raw, c.env));
app.get("/assets/*", async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = assetUrl.pathname.replace(/^\/assets\//, "/");
  return c.env.ASSETS.fetch(assetUrl);
});
app.get("/checks", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const editId = c.req.query("edit");
  const focusId = c.req.query("focus");
  return handleChecksRequest(c.req.raw, c.env, page, editId ? Number(editId) : null, focusId ? Number(focusId) : null);
});
app.post("/checks", async (c) => handleCreateCheck(c.req.raw, c.env));
app.post("/checks/:id", async (c) => handleUpdateCheck(c.req.raw, c.env, Number(c.req.param("id"))));
app.get("/api/checks", async (c) => handleApiListChecks(c.env, c.req.raw));
app.post("/api/checks", async (c) => handleApiCreateCheck(c.env, c.req.raw));
app.get("/api/checks/:id", async (c) => handleApiGetCheck(c.env, Number(c.req.param("id"))));
app.patch("/api/checks/:id", async (c) => handleApiUpdateCheck(c.env, Number(c.req.param("id")), c.req.raw));

export { app };
