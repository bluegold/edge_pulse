import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { AppEnv } from "../../auth/types";
import { handleAccountCreateToken, handleAccountDeleteToken, handleAccountRequest } from "../../controllers/account";

const account = new Hono<AppEnv>();
account.use("*", csrf());
account.get("/", ...handleAccountRequest);
account.post("/tokens", ...handleAccountCreateToken);
account.post("/tokens/:id/delete", ...handleAccountDeleteToken);

export { account };
