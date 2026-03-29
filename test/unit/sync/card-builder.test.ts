import { describe, it, expect } from "vitest";
import type { AdapterTrack } from "../../../src/adapters/types.js";
import { buildCardUpdate } from "../../../src/sync/card-builder.js";

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

describe("buildCardUpdate", () => {
  it("creates a single chapter with all tracks", () => {
    const tracks = [
      makeTrack({ sourceId: "a.mp3", title: "Alpha" }),
      makeTrack({ sourceId: "b.mp3", title: "Beta" }),
      makeTrack({ sourceId: "c.mp3", title: "Gamma" }),
    ];

    const hashes = new Map([
      ["a.mp3", "hash-a"],
      ["b.mp3", "hash-b"],
      ["c.mp3", "hash-c"],
    ]);

    const result = buildCardUpdate("TEST1", "My Playlist", tracks, hashes);

    expect(result.cardId).toBe("TEST1");
    expect(result.title).toBe("My Playlist");
    expect(result.content.chapters).toHaveLength(1);

    const chapter = result.content.chapters[0]!;
    expect(chapter.title).toBe("My Playlist");
    expect(chapter.tracks).toHaveLength(3);
  });

  it("assigns correct yoto:# URLs to tracks", () => {
    const tracks = [makeTrack({ sourceId: "a.mp3", title: "Alpha" })];
    const hashes = new Map([["a.mp3", "abc123def456"]]);

    const result = buildCardUpdate("TEST1", "Test", tracks, hashes);
    const track = result.content.chapters[0]!.tracks[0]!;

    expect(track.trackUrl).toBe("yoto:#abc123def456");
    expect(track.type).toBe("audio");
    expect(track.title).toBe("Alpha");
  });

  it("assigns zero-padded keys in order", () => {
    const tracks = Array.from({ length: 12 }, (_, i) =>
      makeTrack({ sourceId: `track-${i}.mp3`, title: `Track ${i}` }),
    );
    const hashes = new Map(
      tracks.map((t) => [t.sourceId, `hash-${t.sourceId}`]),
    );

    const result = buildCardUpdate("TEST1", "Test", tracks, hashes);
    const keys = result.content.chapters[0]!.tracks.map((t) => t.key);

    expect(keys[0]).toBe("01");
    expect(keys[9]).toBe("10");
    expect(keys[11]).toBe("12");
  });

  it("throws when a yoto hash is missing for a track", () => {
    const tracks = [makeTrack({ sourceId: "a.mp3" })];
    const hashes = new Map<string, string>(); // empty!

    expect(() =>
      buildCardUpdate("TEST1", "Test", tracks, hashes),
    ).toThrow(/Missing Yoto hash/);
  });

  it("sets autoadvance to 'next' and playbackType to 'linear'", () => {
    const tracks = [makeTrack({ sourceId: "a.mp3" })];
    const hashes = new Map([["a.mp3", "hash-a"]]);

    const result = buildCardUpdate("TEST1", "Test", tracks, hashes);

    expect(result.content.config?.autoadvance).toBe("next");
    expect(result.content.playbackType).toBe("linear");
  });
});
