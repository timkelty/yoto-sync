import pino from "pino";
import type { AppConfig } from "./env.js";

/**
 * Create a configured Pino logger with redaction rules
 * for sensitive data (tokens, auth headers, etc.).
 */
export function createLogger(config: AppConfig): pino.Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["set-cookie"]',
        "*.token",
        "*.accessToken",
        "*.refreshToken",
        "*.access_token",
        "*.refresh_token",
        "*.jwt",
        "*.password",
        "*.secret",
      ],
      censor: "[REDACTED]",
    },
    ...(process.env["NODE_ENV"] !== "production"
      ? { transport: { target: "pino-pretty" } }
      : {}),
  });
}
