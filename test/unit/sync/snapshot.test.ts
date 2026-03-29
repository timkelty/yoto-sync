import { describe, it, expect } from "vitest";
import type { AdapterTrack } from "../../../src/adapters/types.js";
import type { SyncSnapshot } from "../../../src/types/sync.js";
import {
  computeSnapshotHash,
  diffSnapshots,
} from "../../../src/sync/snapshot.js";

function makeTrack(overrides: Partial<AdapterTrack> = {}): AdapterTrack {
  return {
    sourceId: "track-1.mp3",
    title: "Track 1",
    sourceUri: "/audio/track-1.mp3",
    sortKey: "track-1.mp3",
    contentHash: "abc123",
    fileSize: 1024,
    filename: "track-1.mp3",
    ...overrides,
  };
}

function makeSnapshot(
  tracks: Array<{
    sourceId: string;
    contentHash: string;
    title: string;
    yotoHash: string;
  }>,
): SyncSnapshot {
  const fakeAdapterTracks = tracks.map((t) =>
    makeTrack({ sourceId: t.sourceId, contentHash: t.contentHash }),
  );
  return {
    syncedAt: new Date().toISOString(),
    snapshotHash: computeSnapshotHash(fakeAdapterTracks),
    tracks: tracks.map((t) => ({
      sourceId: t.sourceId,
      contentHash: t.contentHash,
      title: t.title,
      yotoHash: t.yotoHash,
    })),
  };
}

describe("computeSnapshotHash", () => {
  it("produces a deterministic hash", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" }),
      makeTrack({ sourceId: "b.mp3", contentHash: "hash-b" }),
    ];

    const hash1 = computeSnapshotHash(tracks);
    const hash2 = computeSnapshotHash(tracks);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is order-sensitive", () => {
    const trackA = makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" });
    const trackB = makeTrack({ sourceId: "b.mp3", contentHash: "hash-b" });

    const hash1 = computeSnapshotHash([trackA, trackB]);
    const hash2 = computeSnapshotHash([trackB, trackA]);

    expect(hash1).not.toBe(hash2);
  });
});

describe("diffSnapshots", () => {
  it("treats all tracks as added when previous is null (first sync)", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3" }),
      makeTrack({ sourceId: "b.mp3" }),
    ];

    const diff = diffSnapshots(tracks, null);

    expect(diff.hasChanges).toBe(true);
    expect(diff.added).toHaveLength(2);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it("detects no changes when snapshots match", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" }),
      makeTrack({ sourceId: "b.mp3", contentHash: "hash-b" }),
    ];

    const previous = makeSnapshot([
      {
        sourceId: "a.mp3",
        contentHash: "hash-a",
        title: "A",
        yotoHash: "yoto-a",
      },
      {
        sourceId: "b.mp3",
        contentHash: "hash-b",
        title: "B",
        yotoHash: "yoto-b",
      },
    ]);

    const diff = diffSnapshots(tracks, previous);

    expect(diff.hasChanges).toBe(false);
    expect(diff.unchanged).toHaveLength(2);
  });

  it("detects added tracks", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" }),
      makeTrack({ sourceId: "b.mp3", contentHash: "hash-b" }),
      makeTrack({ sourceId: "c.mp3", contentHash: "hash-c" }),
    ];

    const previous = makeSnapshot([
      {
        sourceId: "a.mp3",
        contentHash: "hash-a",
        title: "A",
        yotoHash: "yoto-a",
      },
      {
        sourceId: "b.mp3",
        contentHash: "hash-b",
        title: "B",
        yotoHash: "yoto-b",
      },
    ]);

    const diff = diffSnapshots(tracks, previous);

    expect(diff.hasChanges).toBe(true);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.sourceId).toBe("c.mp3");
    expect(diff.unchanged).toHaveLength(2);
  });

  it("detects removed tracks", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" }),
    ];

    const previous = makeSnapshot([
      {
        sourceId: "a.mp3",
        contentHash: "hash-a",
        title: "A",
        yotoHash: "yoto-a",
      },
      {
        sourceId: "b.mp3",
        contentHash: "hash-b",
        title: "B",
        yotoHash: "yoto-b",
      },
    ]);

    const diff = diffSnapshots(tracks, previous);

    expect(diff.hasChanges).toBe(true);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.sourceId).toBe("b.mp3");
  });

  it("detects changed tracks (same sourceId, different hash)", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a-new" }),
    ];

    const previous = makeSnapshot([
      {
        sourceId: "a.mp3",
        contentHash: "hash-a-old",
        title: "A",
        yotoHash: "yoto-a",
      },
    ]);

    const diff = diffSnapshots(tracks, previous);

    expect(diff.hasChanges).toBe(true);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.sourceId).toBe("a.mp3");
  });

  it("detects reordering", () => {
    const tracks = [
      makeTrack({ sourceId: "b.mp3", contentHash: "hash-b" }),
      makeTrack({ sourceId: "a.mp3", contentHash: "hash-a" }),
    ];

    const previous = makeSnapshot([
      {
        sourceId: "a.mp3",
        contentHash: "hash-a",
        title: "A",
        yotoHash: "yoto-a",
      },
      {
        sourceId: "b.mp3",
        contentHash: "hash-b",
        title: "B",
        yotoHash: "yoto-b",
      },
    ]);

    const diff = diffSnapshots(tracks, previous);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orderChanged).toBe(true);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(2);
  });

  it("returns no changes for empty current and empty previous", () => {
    const diff = diffSnapshots([], null);
    expect(diff.hasChanges).toBe(false);
  });
});
