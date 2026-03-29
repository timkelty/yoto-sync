import process from "node:process";

export interface AppConfig {
  YOTO_CLIENT_ID: string;
  PORT: number;
  DATA_DIR: string;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
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
    throw new Error(`PORT must be a valid port number, got: ${process.env["PORT"]}`);
  }

  const dataDir = process.env["DATA_DIR"] ?? "./data";

  const logLevel = process.env["LOG_LEVEL"] ?? "info";
  if (!VALID_LOG_LEVELS.has(logLevel)) {
    throw new Error(
      `LOG_LEVEL must be one of: ${[...VALID_LOG_LEVELS].join(", ")}. Got: ${logLevel}`,
    );
  }

  return Object.freeze({
    YOTO_CLIENT_ID: clientId,
    PORT: port,
    DATA_DIR: dataDir,
    LOG_LEVEL: logLevel as AppConfig["LOG_LEVEL"],
  });
}
