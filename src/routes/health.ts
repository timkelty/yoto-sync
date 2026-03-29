import { Hono } from "hono";
import type { AppEnv } from "../types/app.js";

const health = new Hono<AppEnv>();

health.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
  });
});

export { health };
