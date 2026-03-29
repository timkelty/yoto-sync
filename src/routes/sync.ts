import { Hono } from "hono";
import type { YotoSdk } from "@yotoplay/yoto-sdk";
import type { AppEnv } from "../types/app.js";
import type { SyncRequest } from "../types/sync.js";
import { sync, type SyncDeps } from "../sync/engine.js";
import { StateStore } from "../state/store.js";

interface SyncRouteConfig {
  sdk: YotoSdk;
  dataDir: string;
}

const syncRoute = new Hono<AppEnv>();

/**
 * Create the sync route with injected dependencies.
 */
export function createSyncRoute(config: SyncRouteConfig): typeof syncRoute {
  const route = new Hono<AppEnv>();
  const stateStore = new StateStore(config.dataDir);

  route.post("/sync", async (c) => {
    const logger = c.get("logger");

    let body: SyncRequest;
    try {
      body = await c.req.json<SyncRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Validate required fields
    if (!body.cardId || typeof body.cardId !== "string") {
      return c.json({ error: "cardId is required (string)" }, 400);
    }

    if (!body.source || typeof body.source !== "object" || !body.source.type) {
      return c.json(
        { error: "source is required with a valid type" },
        400,
      );
    }

    if (body.source.type === "local-directory" && !body.source.path) {
      return c.json(
        { error: "source.path is required for local-directory adapter" },
        400,
      );
    }

    const deps: SyncDeps = {
      sdk: config.sdk,
      stateStore,
      logger,
    };

    try {
      const result = await sync(body, deps);

      const statusCode = result.status === "error" ? 500 : 200;
      return c.json(result, statusCode);
    } catch (err) {
      logger.error({ err }, "Sync failed with unexpected error");
      return c.json(
        {
          status: "error",
          cardId: body.cardId,
          error: err instanceof Error ? err.message : "Unknown error",
        },
        500,
      );
    }
  });

  return route;
}

export { syncRoute };
