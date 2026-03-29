import { serve } from "@hono/node-server";
import { createYotoSdk } from "@yotoplay/yoto-sdk";
import { DeviceCodeAuth } from "./auth/device-code.js";
import { TokenStore } from "./auth/token-store.js";
import { loadConfig } from "./env.js";
import { createLogger } from "./logger.js";
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
  });

  const server = serve(
    { fetch: app.fetch, port: config.PORT },
    (info) => {
      logger.info({ port: info.port }, "Server listening");
    },
  );

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
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
