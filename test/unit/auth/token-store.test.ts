import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TokenStore, type TokenData } from "../../../src/auth/token-store.js";

describe("TokenStore", () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-tokens-"));
    store = new TokenStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const tokenData: TokenData = {
    accessToken: "access-123",
    refreshToken: "refresh-456",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  it("returns null when no tokens exist", async () => {
    const result = await store.getToken();
    expect(result).toBeNull();
  });

  it("round-trips token data", async () => {
    await store.saveToken(tokenData);
    const loaded = await store.getToken();
    expect(loaded).toEqual(tokenData);
  });

  it("detects non-expired tokens", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(store.isExpired({ ...tokenData, expiresAt: future })).toBe(false);
  });

  it("detects expired tokens", () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(store.isExpired({ ...tokenData, expiresAt: past })).toBe(true);
  });

  it("detects tokens expiring within the 60s buffer", () => {
    const almostExpired = new Date(Date.now() + 30_000).toISOString();
    expect(store.isExpired({ ...tokenData, expiresAt: almostExpired })).toBe(
      true,
    );
  });

  it("writes valid JSON to disk", async () => {
    await store.saveToken(tokenData);

    const raw = await readFile(join(tempDir, "tokens.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.accessToken).toBe("access-123");
    expect(parsed.refreshToken).toBe("refresh-456");
  });
});
