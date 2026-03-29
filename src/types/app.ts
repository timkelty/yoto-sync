import type { HttpBindings } from "@hono/node-server";
import type pino from "pino";

/**
 * Hono environment type for the yoto-sync app.
 * Shared across server, middleware, and route modules.
 */
export type AppEnv = {
  Bindings: HttpBindings;
  Variables: {
    logger: pino.Logger;
    requestId: string;
  };
};
