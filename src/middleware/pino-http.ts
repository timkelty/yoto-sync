import type { MiddlewareHandler } from "hono";
import { pinoHttp } from "pino-http";
import { requestId } from "hono/request-id";
import type pino from "pino";
import type { AppEnv } from "../types/app.js";

/**
 * Create Hono middleware that bridges pino-http for structured request logging.
 * Attaches a request-scoped child logger to `c.get("logger")`.
 */
export function pinoHttpMiddleware(
  logger: pino.Logger,
): MiddlewareHandler<AppEnv>[] {
  const httpLogger = pinoHttp({ logger });

  return [
    requestId(),
    async (c, next) => {
      const { incoming, outgoing } = c.env;

      // Forward Hono's request ID to pino-http
      incoming.id = c.get("requestId");

      // Bridge pino-http (express-style middleware) into Hono
      await new Promise<void>((resolve) => {
        httpLogger(incoming, outgoing, () => resolve());
      });

      // Make the request-scoped logger available to handlers
      c.set("logger", incoming.log);

      await next();
    },
  ];
}
