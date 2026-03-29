import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type pino from "pino";
import { PlexPollScheduler } from "../../../src/scheduler/plex-poll.js";
import type { SyncConfig } from "../../../src/config/sync-config.js";

// Mock the PlexAPI
vi.mock("@lukehagar/plexjs", () => {
  return {
    PlexAPI: vi.fn().mockImplementation(() => ({
      playlist: {
        listPlaylists: vi.fn(),
      },
    })),
  };
});

// Mock the sync engine
vi.mock("../../../src/sync/engine.js", () => ({
  sync: vi.fn(),
}));

// Import sync after mocking
import { sync } from "../../../src/sync/engine.js";

function createMockLogger(): pino.Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as pino.Logger;
}

describe("PlexPollScheduler", () => {
  let tempDir: string;
  let mockLogger: pino.Logger;

  const syncConfig: SyncConfig = {
    mappings: [
      {
        name: "Kids Music",
        plexPlaylistId: 100,
        cardId: "card-abc",
        title: "Kids Songs",
      },
      {
        name: "Bedtime",
        plexPlaylistId: 200,
        cardId: "card-def",
      },
    ],
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-scheduler-test-"));
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createScheduler(
    overrides: Partial<{ syncConfig: SyncConfig }> = {},
  ) {
    return new PlexPollScheduler({
      sdk: {} as never,
      plexUrl: "http://localhost:32400",
      plexToken: "test-token",
      syncConfig: overrides.syncConfig ?? syncConfig,
      dataDir: tempDir,
      pollIntervalSeconds: 300,
      logger: mockLogger,
    });
  }

  function mockListPlaylists(
    scheduler: PlexPollScheduler,
    playlists: Array<{
      ratingKey: string;
      title: string;
      updatedAt: number;
    }>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plex = (scheduler as any).plex;
    plex.playlist.listPlaylists.mockResolvedValue({
      mediaContainerWithPlaylistMetadata: {
        mediaContainer: {
          metadata: playlists.map((p) => ({
            ratingKey: p.ratingKey,
            title: p.title,
            updatedAt: p.updatedAt,
            playlistType: "audio",
          })),
        },
      },
    });
  }

  it("detects changes on first poll (no prior state)", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);
    mockSync.mockResolvedValue({
      status: "synced",
      cardId: "card-abc",
      tracksUploaded: 3,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 3,
      duration: 1000,
    });

    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);

    await scheduler.poll();

    // Both mappings should have been synced (no prior lastSeen)
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card-abc",
        title: "Kids Songs",
        source: expect.objectContaining({
          type: "plex-playlist",
          playlistId: 100,
        }),
      }),
      expect.anything(),
    );
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card-def",
        title: "Bedtime", // falls back to Plex title
      }),
      expect.anything(),
    );
  });

  it("skips unchanged playlists on subsequent polls", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);
    mockSync.mockResolvedValue({
      status: "synced",
      cardId: "card-abc",
      tracksUploaded: 0,
      tracksUnchanged: 3,
      tracksRemoved: 0,
      totalTracks: 3,
      duration: 100,
    });

    // First poll — both are new
    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);

    await scheduler.poll();
    expect(mockSync).toHaveBeenCalledTimes(2);

    mockSync.mockClear();

    // Second poll — same updatedAt timestamps → no changes
    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);

    await scheduler.poll();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("detects when a playlist is updated", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);
    mockSync.mockResolvedValue({
      status: "synced",
      cardId: "card-abc",
      tracksUploaded: 1,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 1,
      duration: 100,
    });

    // First poll
    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);
    await scheduler.poll();
    mockSync.mockClear();

    // Second poll — playlist 100 updated
    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1500 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);
    await scheduler.poll();

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "card-abc" }),
      expect.anything(),
    );
  });

  it("warns when a mapped playlist is not found in Plex", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);
    mockSync.mockResolvedValue({
      status: "synced",
      cardId: "card-abc",
      tracksUploaded: 1,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 1,
      duration: 100,
    });

    // Only return one of the two mapped playlists
    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      // Playlist 200 is missing
    ]);

    await scheduler.poll();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ plexPlaylistId: 200 }),
      expect.stringContaining("not found in Plex"),
    );
  });

  it("does not update lastSeen on sync failure", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);

    // First call fails
    mockSync.mockRejectedValueOnce(new Error("Upload failed"));
    // Second call succeeds
    mockSync.mockResolvedValueOnce({
      status: "synced",
      cardId: "card-def",
      tracksUploaded: 1,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 1,
      duration: 100,
    });

    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);

    await scheduler.poll();

    // Both were attempted
    expect(mockSync).toHaveBeenCalledTimes(2);
    mockSync.mockClear();

    // Second poll — playlist 100 should still be retried (lastSeen not updated)
    mockSync.mockResolvedValue({
      status: "synced",
      cardId: "card-abc",
      tracksUploaded: 1,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 1,
      duration: 100,
    });

    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
      { ratingKey: "200", title: "Bedtime", updatedAt: 2000 },
    ]);

    await scheduler.poll();

    // Only playlist 100 should be synced (200 is already up-to-date)
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: "card-abc" }),
      expect.anything(),
    );
  });

  it("does not run concurrent poll cycles", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);

    // Make sync slow
    mockSync.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                status: "synced",
                cardId: "card-abc",
                tracksUploaded: 0,
                tracksUnchanged: 0,
                tracksRemoved: 0,
                totalTracks: 0,
                duration: 100,
              }),
            100,
          ),
        ),
    );

    mockListPlaylists(scheduler, [
      { ratingKey: "100", title: "Kids Music", updatedAt: 1000 },
    ]);

    // Start two polls concurrently
    const p1 = scheduler.poll();
    const p2 = scheduler.poll();
    await Promise.all([p1, p2]);

    // Only one should have actually run sync
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "Poll cycle already in progress, skipping",
    );
  });

  it("stop() clears the interval", async () => {
    const scheduler = createScheduler();
    const mockSync = vi.mocked(sync);
    mockSync.mockResolvedValue({
      status: "no-changes",
      cardId: "card-abc",
      tracksUploaded: 0,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 0,
      duration: 0,
    });

    mockListPlaylists(scheduler, []);

    await scheduler.start();
    scheduler.stop();

    expect(mockLogger.info).toHaveBeenCalledWith("Plex poll scheduler stopped");
  });
});
