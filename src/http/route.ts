import { app, handleApiCreateCheck, handleApiListChecks, handleApiUpdateCheck, handleCreateCheck, handleUpdateCheck, isHxRequest, requireApiToken, renderChecksFromDb, renderChecksShellFromDb, renderDashboardShellFromDb, renderFromDb } from "./app";

app.use("/api/*", async (c, next) => {
  const tokenCheck = await requireApiToken(c.req.raw, c.env);
  if (tokenCheck) return tokenCheck;
  await next();
});

app.get("/", async (c) => (isHxRequest(c.req.raw) ? renderDashboardShellFromDb(c.env) : renderFromDb(c.env)));
app.get("/assets/*", async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = assetUrl.pathname.replace(/^\/assets\//, "/");
  return c.env.ASSETS.fetch(assetUrl);
});
app.get("/checks", async (c) => {
  const page = Number(c.req.query("page") ?? "1");
  const editId = c.req.query("edit");
  const focusId = c.req.query("focus");
  return isHxRequest(c.req.raw)
    ? renderChecksShellFromDb(c.env, page, editId ? Number(editId) : null, focusId ? Number(focusId) : null)
    : renderChecksFromDb(c.env, page, editId ? Number(editId) : null, focusId ? Number(focusId) : null);
});
app.post("/checks", async (c) => handleCreateCheck(c.req.raw, c.env));
app.post("/checks/:id", async (c) => handleUpdateCheck(c.req.raw, c.env, Number(c.req.param("id"))));
app.get("/api/checks", async (c) => handleApiListChecks(c.env, c.req.raw));
app.post("/api/checks", async (c) => handleApiCreateCheck(c.env, c.req.raw));
app.get("/api/checks/:id", async (c) => {
  const check = await c.env["pulse-db"].prepare(`SELECT * FROM checks WHERE id = ? LIMIT 1`).bind(Number(c.req.param("id"))).first();
  if (!check) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  return new Response(JSON.stringify({ check }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
});
app.patch("/api/checks/:id", async (c) => handleApiUpdateCheck(c.env, Number(c.req.param("id")), c.req.raw));

export { app };
