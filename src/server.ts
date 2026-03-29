import { Hono } from "hono";
import type pino from "pino";
import type { YotoSdk } from "@yotoplay/yoto-sdk";
import type { AppEnv } from "./types/app.js";
import { pinoHttpMiddleware } from "./middleware/pino-http.js";
import { health } from "./routes/health.js";
import { createSyncRoute } from "./routes/sync.js";

interface AppOptions {
  logger: pino.Logger;
  sdk: YotoSdk;
  dataDir: string;
}

/**
 * Create and configure the Hono application.
 */
export function createApp(options: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Request logging middleware
  const middlewares = pinoHttpMiddleware(options.logger);
  for (const mw of middlewares) {
    app.use(mw);
  }

  // Routes
  app.route("/", health);
  app.route("/", createSyncRoute({
    sdk: options.sdk,
    dataDir: options.dataDir,
  }));

  // Global error handler
  app.onError((err, c) => {
    const logger = c.get("logger");
    logger.error({ err }, "Unhandled error");
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
