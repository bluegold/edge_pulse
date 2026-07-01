import { Hono } from "hono";
import type { Bindings } from "../lib/bindings";

export const app = new Hono<{ Bindings: Bindings }>();
