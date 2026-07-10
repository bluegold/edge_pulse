import { app } from "./app";
import { accessMiddleware } from "./middleware/access";
import { apiTokenMiddleware } from "./middleware/api-token";
import { api } from "./routes/api";
import { checks } from "./routes/checks";
import { dashboard } from "./routes/dashboard";

app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/")) {
    await next();
    return;
  }
  return accessMiddleware(c, next);
});

app.use("/api/*", apiTokenMiddleware);

app.get("/assets/*", async (c) => {
  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = assetUrl.pathname.replace(/^\/assets\//, "/");
  return c.env.ASSETS.fetch(assetUrl);
});
app.route("/", dashboard);
app.route("/checks", checks);
app.route("/api", api);

export { app };
