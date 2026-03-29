import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../../../src/state/store.js";
import type { SyncSnapshot } from "../../../src/types/sync.js";

describe("StateStore", () => {
  let tempDir: string;
  let store: StateStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-state-"));
    store = new StateStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const snapshot: SyncSnapshot = {
    syncedAt: "2025-01-01T00:00:00.000Z",
    snapshotHash: "abc123",
    tracks: [
      {
        sourceId: "track-1.mp3",
        contentHash: "hash-1",
        title: "Track 1",
        yotoHash: "yoto-1",
      },
    ],
  };

  it("returns null for missing cardId", async () => {
    const result = await store.getSnapshot("nonexistent");
    expect(result).toBeNull();
  });

  it("round-trips a snapshot (save then load)", async () => {
    await store.saveSnapshot("CARD1", snapshot);
    const loaded = await store.getSnapshot("CARD1");
    expect(loaded).toEqual(snapshot);
  });

  it("stores multiple card snapshots independently", async () => {
    const snapshot2: SyncSnapshot = {
      ...snapshot,
      snapshotHash: "def456",
    };

    await store.saveSnapshot("CARD1", snapshot);
    await store.saveSnapshot("CARD2", snapshot2);

    const loaded1 = await store.getSnapshot("CARD1");
    const loaded2 = await store.getSnapshot("CARD2");

    expect(loaded1?.snapshotHash).toBe("abc123");
    expect(loaded2?.snapshotHash).toBe("def456");
  });

  it("overwrites snapshot for the same cardId", async () => {
    await store.saveSnapshot("CARD1", snapshot);

    const updated: SyncSnapshot = {
      ...snapshot,
      snapshotHash: "updated-hash",
    };
    await store.saveSnapshot("CARD1", updated);

    const loaded = await store.getSnapshot("CARD1");
    expect(loaded?.snapshotHash).toBe("updated-hash");
  });

  it("handles corrupt state file gracefully", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tempDir, "state.json"), "not valid json");

    const result = await store.getSnapshot("CARD1");
    expect(result).toBeNull();
  });

  it("creates data directory if it doesn't exist", async () => {
    const nestedDir = join(tempDir, "nested", "dir");
    const nestedStore = new StateStore(nestedDir);

    await nestedStore.saveSnapshot("CARD1", snapshot);
    const loaded = await nestedStore.getSnapshot("CARD1");
    expect(loaded).toEqual(snapshot);
  });

  it("writes valid JSON to disk", async () => {
    await store.saveSnapshot("CARD1", snapshot);

    const raw = await readFile(join(tempDir, "state.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed["CARD1"]).toEqual(snapshot);
  });
});
