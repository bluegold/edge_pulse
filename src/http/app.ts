import { Hono } from "hono";
import type { AppEnv } from "../auth/types";

export const app = new Hono<AppEnv>();
