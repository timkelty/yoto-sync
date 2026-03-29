import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IconCache } from "../../../src/icons/icon-cache.js";
import { StateStore } from "../../../src/state/store.js";

describe("IconCache", () => {
  let tempDir: string;
  let cache: IconCache;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-icon-cache-"));
    const store = new StateStore(tempDir);
    cache = new IconCache(store);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for a cache miss", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  it("round-trips a cached entry", async () => {
    await cache.set("dinosaur", {
      yotoIconId: "1234",
      mediaId: "abc123",
    });

    const result = await cache.get("dinosaur");
    expect(result).toEqual({
      yotoIconId: "1234",
      mediaId: "abc123",
    });
  });

  it("stores multiple terms independently", async () => {
    await cache.set("dinosaur", {
      yotoIconId: "1234",
      mediaId: "abc123",
    });
    await cache.set("music", {
      yotoIconId: "5678",
      mediaId: "def456",
    });

    const dino = await cache.get("dinosaur");
    const music = await cache.get("music");

    expect(dino?.mediaId).toBe("abc123");
    expect(music?.mediaId).toBe("def456");
  });

  it("overwrites existing entry for the same term", async () => {
    await cache.set("dinosaur", {
      yotoIconId: "1234",
      mediaId: "abc123",
    });
    await cache.set("dinosaur", {
      yotoIconId: "9999",
      mediaId: "new-media-id",
    });

    const result = await cache.get("dinosaur");
    expect(result).toEqual({
      yotoIconId: "9999",
      mediaId: "new-media-id",
    });
  });
});
