import { Hono } from "hono";
import { csrf } from "hono/csrf";
import {
  handleCertificateRecheck,
  handleCheckDetailRequest,
  handleChecksRequest,
  handleCreateCheck,
  handleMoveCheckToGroup,
  handleUpdateCheck,
} from "../../controllers/checks";

const checks = new Hono<{ Bindings: Env }>();

checks.use("*", csrf());

checks.get("/", ...handleChecksRequest);
checks.get("/:id", ...handleCheckDetailRequest);
checks.post("/", ...handleCreateCheck);
checks.post("/:id/group", ...handleMoveCheckToGroup);
checks.post("/:id", ...handleUpdateCheck);
checks.post("/:id/certificate/recheck", ...handleCertificateRecheck);

export { checks };
