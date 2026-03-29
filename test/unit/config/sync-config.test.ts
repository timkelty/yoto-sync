import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSyncConfig } from "../../../src/config/sync-config.js";

describe("loadSyncConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads a valid config file", async () => {
    const configPath = join(tempDir, "sync-config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          {
            name: "Kids Music",
            plexPlaylistId: 12345,
            cardId: "card-abc",
            title: "My Card",
            loudnorm: true,
          },
          {
            name: "Bedtime Stories",
            plexPlaylistId: 67890,
            cardId: "card-def",
            mediaPathMapping: {
              from: "/data/music",
              to: "/mnt/media/music",
            },
          },
        ],
      }),
    );

    const config = await loadSyncConfig(configPath);

    expect(config.mappings).toHaveLength(2);
    expect(config.mappings[0]).toEqual({
      name: "Kids Music",
      plexPlaylistId: 12345,
      cardId: "card-abc",
      title: "My Card",
      loudnorm: true,
      icon: undefined,
      mediaPathMapping: undefined,
    });
    expect(config.mappings[1]!.mediaPathMapping).toEqual({
      from: "/data/music",
      to: "/mnt/media/music",
    });
  });

  it("throws for missing file", async () => {
    await expect(
      loadSyncConfig(join(tempDir, "nonexistent.json")),
    ).rejects.toThrow("Failed to read sync config");
  });

  it("throws for invalid JSON", async () => {
    const configPath = join(tempDir, "bad.json");
    await writeFile(configPath, "not json {{{");

    await expect(loadSyncConfig(configPath)).rejects.toThrow("not valid JSON");
  });

  it("throws when mappings is missing", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify({}));

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      '"mappings" must be an array',
    );
  });

  it("throws when mappings is empty", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify({ mappings: [] }));

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      '"mappings" must not be empty',
    );
  });

  it("throws for missing required fields", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [{ name: "test" }],
      }),
    );

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      '"plexPlaylistId" is required',
    );
  });

  it("throws for non-integer plexPlaylistId", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [{ name: "test", plexPlaylistId: "abc", cardId: "card-1" }],
      }),
    );

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      '"plexPlaylistId" is required (integer)',
    );
  });

  it("throws for duplicate cardId", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          { name: "a", plexPlaylistId: 1, cardId: "card-1" },
          { name: "b", plexPlaylistId: 2, cardId: "card-1" },
        ],
      }),
    );

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      'duplicate cardId "card-1"',
    );
  });

  it("throws for duplicate plexPlaylistId", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          { name: "a", plexPlaylistId: 1, cardId: "card-1" },
          { name: "b", plexPlaylistId: 1, cardId: "card-2" },
        ],
      }),
    );

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      "duplicate plexPlaylistId 1",
    );
  });

  it("parses icon as a string search query", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          {
            name: "Dino Songs",
            plexPlaylistId: 1,
            cardId: "card-1",
            icon: "dinosaur",
          },
        ],
      }),
    );

    const config = await loadSyncConfig(configPath);
    expect(config.mappings[0]!.icon).toBe("dinosaur");
  });

  it("parses icon as false (disabled)", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          {
            name: "No Icon",
            plexPlaylistId: 1,
            cardId: "card-1",
            icon: false,
          },
        ],
      }),
    );

    const config = await loadSyncConfig(configPath);
    expect(config.mappings[0]!.icon).toBe(false);
  });

  it("throws for non-string/non-false icon value", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mappings: [
          {
            name: "Bad Icon",
            plexPlaylistId: 1,
            cardId: "card-1",
            icon: 123,
          },
        ],
      }),
    );

    await expect(loadSyncConfig(configPath)).rejects.toThrow(
      '"icon" must be a string or false',
    );
  });
});
