import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  /** ISO-8601 expiry time */
  expiresAt: string;
}

/**
 * Persist and retrieve OAuth tokens from a JSON file.
 * Uses atomic writes (write-to-temp + rename) to prevent corruption.
 */
export class TokenStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "tokens.json");
  }

  /**
   * Load stored tokens, or return null if none exist.
   */
  async getToken(): Promise<TokenData | null> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as TokenData;
    } catch {
      return null;
    }
  }

  /**
   * Persist tokens to disk atomically.
   */
  async saveToken(data: TokenData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  /**
   * Check if the stored access token is expired (with a 60s buffer).
   */
  isExpired(data: TokenData): boolean {
    const expiresAt = new Date(data.expiresAt).getTime();
    const now = Date.now();
    const bufferMs = 60_000;
    return now >= expiresAt - bufferMs;
  }
}
