import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { handleAdminCreateGroup, handleAdminMoveCheck, handleAdminRequest, handleAdminSetUserGroup } from "../../controllers/admin";
import type { AppEnv } from "../../auth/types";

const admin = new Hono<AppEnv>();
admin.use("*", csrf());
admin.get("/", ...handleAdminRequest);
admin.post("/groups", ...handleAdminCreateGroup);
admin.post("/users/:id/groups", ...handleAdminSetUserGroup);
admin.post("/checks/:id/group", ...handleAdminMoveCheck);

export { admin };
