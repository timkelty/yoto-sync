import { serve } from "@hono/node-server";
import { createYotoSdk } from "@yotoplay/yoto-sdk";
import { DeviceCodeAuth } from "./auth/device-code.js";
import { TokenStore } from "./auth/token-store.js";
import { loadSyncConfig } from "./config/sync-config.js";
import { loadConfig } from "./env.js";
import { createLogger } from "./logger.js";
import { PlexPollScheduler } from "./scheduler/plex-poll.js";
import { createApp } from "./server.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config);

  logger.info(
    { port: config.PORT, dataDir: config.DATA_DIR },
    "Starting yoto-sync",
  );

  // Auth: get or refresh access token
  const tokenStore = new TokenStore(config.DATA_DIR);
  const auth = new DeviceCodeAuth(config.YOTO_CLIENT_ID, tokenStore, logger);
  const accessToken = await auth.getAccessToken();

  // Create SDK instance with the obtained token
  const sdk = createYotoSdk({ jwt: accessToken });

  // Create and start the server
  const app = createApp({
    logger,
    sdk,
    dataDir: config.DATA_DIR,
    yotoJwt: accessToken,
  });

  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    logger.info({ port: info.port }, "Server listening");
  });

  // Start Plex polling scheduler if configured
  let scheduler: PlexPollScheduler | undefined;

  if (config.PLEX_URL && config.PLEX_TOKEN && config.SYNC_CONFIG_PATH) {
    try {
      const syncConfig = await loadSyncConfig(config.SYNC_CONFIG_PATH);
      scheduler = new PlexPollScheduler({
        sdk,
        plexUrl: config.PLEX_URL,
        plexToken: config.PLEX_TOKEN,
        syncConfig,
        dataDir: config.DATA_DIR,
        pollIntervalSeconds: config.POLL_INTERVAL_SECONDS ?? 300,
        logger: logger.child({ component: "plex-scheduler" }),
        yotoJwt: accessToken,
      });
      await scheduler.start();
    } catch (err) {
      logger.error({ err }, "Failed to start Plex poll scheduler");
    }
  }

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    scheduler?.stop();
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
