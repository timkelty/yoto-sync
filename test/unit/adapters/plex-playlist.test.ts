import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PlexPlaylistAdapter } from "../../../src/adapters/plex-playlist.js";

// Mock the PlexAPI class
vi.mock("@lukehagar/plexjs", () => {
  return {
    PlexAPI: vi.fn().mockImplementation(() => ({
      playlist: {
        getPlaylistItems: vi.fn(),
      },
    })),
  };
});

describe("PlexPlaylistAdapter", () => {
  let tempDir: string;
  let musicDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-plex-test-"));
    musicDir = join(tempDir, "music", "Artist", "Album");
    await mkdir(musicDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function createAdapter(
    overrides: Partial<{
      playlistId: number;
      mediaPathMapping: { from: string; to: string };
    }> = {},
  ) {
    return new PlexPlaylistAdapter({
      type: "plex-playlist",
      playlistId: overrides.playlistId ?? 12345,
      plexUrl: "http://localhost:32400",
      plexToken: "test-token",
      mediaPathMapping: overrides.mediaPathMapping,
    });
  }

  function mockPlaylistItems(
    adapter: PlexPlaylistAdapter,
    items: Array<{
      ratingKey: string;
      title: string;
      grandparentTitle?: string;
      parentTitle?: string;
      filePath: string;
      duration?: number;
    }>,
  ) {
    const metadata = items.map((item) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      grandparentTitle: item.grandparentTitle,
      parentTitle: item.parentTitle,
      duration: item.duration ?? 180000,
      media: [
        {
          part: [
            {
              file: item.filePath,
              container: item.filePath.split(".").pop(),
              size: 1024,
            },
          ],
          audioCodec: item.filePath.split(".").pop(),
          container: item.filePath.split(".").pop(),
        },
      ],
    }));

    // Access the mocked Plex instance via the adapter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plex = (adapter as any).plex;
    plex.playlist.getPlaylistItems.mockResolvedValue({
      mediaContainerWithMetadata: {
        mediaContainer: {
          metadata,
          size: metadata.length,
          totalSize: metadata.length,
        },
      },
    });
  }

  it("returns tracks from Plex playlist in order", async () => {
    const adapter = createAdapter();

    const track1Path = join(musicDir, "01 First.mp3");
    const track2Path = join(musicDir, "02 Second.mp3");
    await writeFile(track1Path, "audio-content-1");
    await writeFile(track2Path, "audio-content-2");

    mockPlaylistItems(adapter, [
      {
        ratingKey: "100",
        title: "First Track",
        grandparentTitle: "Test Artist",
        filePath: track1Path,
      },
      {
        ratingKey: "200",
        title: "Second Track",
        grandparentTitle: "Test Artist",
        filePath: track2Path,
      },
    ]);

    const tracks = await adapter.getTracks();

    expect(tracks).toHaveLength(2);
    expect(tracks[0]!.sourceId).toBe("plex:100");
    expect(tracks[0]!.title).toBe("Test Artist - First Track");
    expect(tracks[0]!.sourceUri).toBe(track1Path);
    expect(tracks[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);

    expect(tracks[1]!.sourceId).toBe("plex:200");
    expect(tracks[1]!.title).toBe("Test Artist - Second Track");
  });

  it("preserves playlist order via sortKey", async () => {
    const adapter = createAdapter();

    const trackA = join(musicDir, "z-last.mp3");
    const trackB = join(musicDir, "a-first.mp3");
    await writeFile(trackA, "audio-a");
    await writeFile(trackB, "audio-b");

    // Playlist order: Z first, then A
    mockPlaylistItems(adapter, [
      { ratingKey: "1", title: "Z Track", filePath: trackA },
      { ratingKey: "2", title: "A Track", filePath: trackB },
    ]);

    const tracks = await adapter.getTracks();

    // sortKey should preserve playlist order (index-based), not filename order
    expect(tracks[0]!.sortKey).toBe("000000");
    expect(tracks[1]!.sortKey).toBe("000001");
    expect(tracks[0]!.title).toBe("Z Track");
    expect(tracks[1]!.title).toBe("A Track");
  });

  it("skips items with no file path", async () => {
    const adapter = createAdapter();

    const validTrack = join(musicDir, "track.mp3");
    await writeFile(validTrack, "audio");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plex = (adapter as any).plex;
    plex.playlist.getPlaylistItems.mockResolvedValue({
      mediaContainerWithMetadata: {
        mediaContainer: {
          metadata: [
            // Valid track
            {
              ratingKey: "1",
              title: "Valid",
              media: [{ part: [{ file: validTrack, container: "mp3" }] }],
            },
            // No media at all (e.g. Tidal track)
            {
              ratingKey: "2",
              title: "Tidal Track",
              media: [],
            },
            // Media but no file path
            {
              ratingKey: "3",
              title: "Missing File",
              media: [{ part: [{ container: "mp3" }] }],
            },
          ],
        },
      },
    });

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.sourceId).toBe("plex:1");
  });

  it("skips unsupported file extensions", async () => {
    const adapter = createAdapter();

    const mp3Track = join(musicDir, "track.mp3");
    const videoTrack = join(musicDir, "video.mkv");
    await writeFile(mp3Track, "audio");
    await writeFile(videoTrack, "video");

    mockPlaylistItems(adapter, [
      { ratingKey: "1", title: "Audio", filePath: mp3Track },
      { ratingKey: "2", title: "Video", filePath: videoTrack },
    ]);

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.sourceId).toBe("plex:1");
  });

  it("applies media path mapping", async () => {
    const localMusicDir = join(tempDir, "local-mount", "Artist", "Album");
    await mkdir(localMusicDir, { recursive: true });

    const localTrack = join(localMusicDir, "track.mp3");
    await writeFile(localTrack, "audio-content");

    const adapter = createAdapter({
      mediaPathMapping: {
        from: "/plex/data/media",
        to: join(tempDir, "local-mount"),
      },
    });

    mockPlaylistItems(adapter, [
      {
        ratingKey: "1",
        title: "Mapped Track",
        filePath: "/plex/data/media/Artist/Album/track.mp3",
      },
    ]);

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.sourceUri).toBe(localTrack);
  });

  it("uses title without artist when grandparentTitle is missing", async () => {
    const adapter = createAdapter();

    const trackPath = join(musicDir, "track.mp3");
    await writeFile(trackPath, "audio");

    mockPlaylistItems(adapter, [
      {
        ratingKey: "1",
        title: "Solo Track",
        filePath: trackPath,
        // no grandparentTitle
      },
    ]);

    const tracks = await adapter.getTracks();
    expect(tracks[0]!.title).toBe("Solo Track");
  });

  it("reads track content correctly", async () => {
    const adapter = createAdapter();

    const content = "test-audio-data-for-plex";
    const trackPath = join(musicDir, "track.mp3");
    await writeFile(trackPath, content);

    mockPlaylistItems(adapter, [
      { ratingKey: "1", title: "Test", filePath: trackPath },
    ]);

    const tracks = await adapter.getTracks();
    const buffer = await adapter.readTrackContent(tracks[0]!);
    expect(buffer.toString()).toBe(content);
  });

  it("computes stable content hashes", async () => {
    const adapter = createAdapter();

    const trackPath = join(musicDir, "track.mp3");
    await writeFile(trackPath, "consistent-content");

    mockPlaylistItems(adapter, [
      { ratingKey: "1", title: "Test", filePath: trackPath },
    ]);

    const tracks1 = await adapter.getTracks();

    // Re-mock (the mock is stateless)
    mockPlaylistItems(adapter, [
      { ratingKey: "1", title: "Test", filePath: trackPath },
    ]);

    const tracks2 = await adapter.getTracks();

    expect(tracks1[0]!.contentHash).toBe(tracks2[0]!.contentHash);
    expect(tracks1[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns empty array for empty playlist", async () => {
    const adapter = createAdapter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plex = (adapter as any).plex;
    plex.playlist.getPlaylistItems.mockResolvedValue({
      mediaContainerWithMetadata: {
        mediaContainer: {
          metadata: [],
        },
      },
    });

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(0);
  });
});
