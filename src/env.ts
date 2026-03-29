import process from "node:process";

export interface AppConfig {
  YOTO_CLIENT_ID: string;
  PORT: number;
  DATA_DIR: string;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";

  /** Plex server URL (optional, required for Plex adapter) */
  PLEX_URL?: string;
  /** Plex authentication token (optional, required for Plex adapter) */
  PLEX_TOKEN?: string;
  /** Path to sync config file for playlist-to-card mapping (optional) */
  SYNC_CONFIG_PATH?: string;
  /** Polling interval in seconds for auto-sync (default: 300 = 5 minutes) */
  POLL_INTERVAL_SECONDS?: number;
}

const VALID_LOG_LEVELS = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

/**
 * Load and validate environment variables into a typed config.
 * Throws on missing required values.
 */
export function loadConfig(): AppConfig {
  const clientId = process.env["YOTO_CLIENT_ID"];
  if (!clientId) {
    throw new Error(
      "YOTO_CLIENT_ID environment variable is required. " +
        "Register an app at https://dashboard.yoto.dev/ to get one.",
    );
  }

  const port = parseInt(process.env["PORT"] ?? "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be a valid port number, got: ${process.env["PORT"]}`,
    );
  }

  const dataDir = process.env["DATA_DIR"] ?? "./data";

  const logLevel = process.env["LOG_LEVEL"] ?? "info";
  if (!VALID_LOG_LEVELS.has(logLevel)) {
    throw new Error(
      `LOG_LEVEL must be one of: ${[...VALID_LOG_LEVELS].join(", ")}. Got: ${logLevel}`,
    );
  }

  // Optional: Plex configuration
  const plexUrl = process.env["PLEX_URL"]?.replace(/\/+$/, ""); // strip trailing slashes
  const plexToken = process.env["PLEX_TOKEN"];

  if ((plexUrl && !plexToken) || (!plexUrl && plexToken)) {
    throw new Error(
      "PLEX_URL and PLEX_TOKEN must both be set if either is provided.",
    );
  }

  const syncConfigPath = process.env["SYNC_CONFIG_PATH"];

  const pollIntervalRaw = process.env["POLL_INTERVAL_SECONDS"];
  let pollIntervalSeconds: number | undefined;
  if (pollIntervalRaw) {
    pollIntervalSeconds = parseInt(pollIntervalRaw, 10);
    if (isNaN(pollIntervalSeconds) || pollIntervalSeconds < 10) {
      throw new Error(
        `POLL_INTERVAL_SECONDS must be a number >= 10, got: ${pollIntervalRaw}`,
      );
    }
  }

  return Object.freeze({
    YOTO_CLIENT_ID: clientId,
    PORT: port,
    DATA_DIR: dataDir,
    LOG_LEVEL: logLevel as AppConfig["LOG_LEVEL"],
    PLEX_URL: plexUrl,
    PLEX_TOKEN: plexToken,
    SYNC_CONFIG_PATH: syncConfigPath,
    POLL_INTERVAL_SECONDS: pollIntervalSeconds,
  });
}
