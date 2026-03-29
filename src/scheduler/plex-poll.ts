import type pino from "pino";
import type { YotoSdk } from "@yotoplay/yoto-sdk";
import { PlexAPI } from "@lukehagar/plexjs";
import { PlaylistType } from "@lukehagar/plexjs/sdk/models/operations/listplaylists.js";
import type { PlaylistMapping, SyncConfig } from "../config/sync-config.js";
import type { PlexPlaylistConfig } from "../adapters/types.js";
import { sync } from "../sync/engine.js";
import { StateStore } from "../state/store.js";

export interface SchedulerDeps {
  sdk: YotoSdk;
  plexUrl: string;
  plexToken: string;
  syncConfig: SyncConfig;
  dataDir: string;
  pollIntervalSeconds: number;
  logger: pino.Logger;
  /** JWT for Yoto API (needed for icon uploads). If absent, icons are skipped. */
  yotoJwt?: string;
}

/**
 * Polling scheduler that watches Plex playlists for changes
 * and triggers syncs to mapped Yoto cards.
 *
 * Change detection: compare each playlist's `updatedAt` epoch
 * against the last-seen value. Only sync when the timestamp changes.
 */
export class PlexPollScheduler {
  private readonly deps: SchedulerDeps;
  private readonly plex: PlexAPI;
  private readonly stateStore: StateStore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /**
   * Map of plexPlaylistId → last-seen updatedAt epoch (seconds).
   * Persisted to disk so we don't re-sync on every restart.
   */
  private lastSeen = new Map<number, number>();

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
    this.plex = new PlexAPI({
      serverURL: deps.plexUrl,
      token: deps.plexToken,
    });
    this.stateStore = new StateStore(deps.dataDir);
  }

  /**
   * Start the polling loop. Safe to call multiple times (no-op if already running).
   */
  async start(): Promise<void> {
    if (this.timer) return;

    const { logger, pollIntervalSeconds } = this.deps;

    // Load persisted last-seen timestamps
    await this.loadLastSeen();

    logger.info(
      {
        intervalSeconds: pollIntervalSeconds,
        mappingCount: this.deps.syncConfig.mappings.length,
      },
      "Starting Plex poll scheduler",
    );

    // Run immediately on start, then on interval
    await this.poll();

    this.timer = setInterval(
      () => void this.poll(),
      pollIntervalSeconds * 1000,
    );
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.deps.logger.info("Plex poll scheduler stopped");
    }
  }

  /**
   * Execute a single poll cycle: check for changes, sync as needed.
   */
  async poll(): Promise<void> {
    if (this.running) {
      this.deps.logger.debug("Poll cycle already in progress, skipping");
      return;
    }

    this.running = true;
    const { logger } = this.deps;

    try {
      logger.debug("Polling Plex for playlist changes");

      // Fetch all audio playlists from Plex
      const response = await this.plex.playlist.listPlaylists({
        playlistType: PlaylistType.Audio,
      });

      const playlists =
        response.mediaContainerWithPlaylistMetadata?.mediaContainer?.metadata ?? [];

      // Build lookup: ratingKey → updatedAt
      const plexState = new Map<number, { updatedAt: number; title: string }>();
      for (const p of playlists) {
        const ratingKey = Number(p.ratingKey);
        if (!isNaN(ratingKey)) {
          plexState.set(ratingKey, {
            updatedAt: (p.updatedAt as number) ?? 0,
            title: String(p.title ?? ""),
          });
        }
      }

      // Check each mapping for changes
      const changed: Array<{ mapping: PlaylistMapping; plexTitle: string }> = [];

      for (const mapping of this.deps.syncConfig.mappings) {
        const plexInfo = plexState.get(mapping.plexPlaylistId);

        if (!plexInfo) {
          logger.warn(
            { plexPlaylistId: mapping.plexPlaylistId, name: mapping.name },
            "Mapped playlist not found in Plex — skipping",
          );
          continue;
        }

        const lastSeenAt = this.lastSeen.get(mapping.plexPlaylistId);

        if (lastSeenAt === undefined || plexInfo.updatedAt > lastSeenAt) {
          changed.push({ mapping, plexTitle: plexInfo.title });
        }
      }

      if (changed.length === 0) {
        logger.debug("No playlist changes detected");
        return;
      }

      logger.info(
        { changedCount: changed.length },
        "Playlist changes detected, syncing",
      );

      // Sync changed playlists sequentially (avoid overwhelming Yoto API)
      for (const { mapping, plexTitle } of changed) {
        try {
          await this.syncMapping(mapping, plexTitle);

          // Update last-seen on success
          const plexInfo = plexState.get(mapping.plexPlaylistId);
          if (plexInfo) {
            this.lastSeen.set(mapping.plexPlaylistId, plexInfo.updatedAt);
          }
        } catch (err) {
          logger.error(
            { err, name: mapping.name, cardId: mapping.cardId },
            "Failed to sync mapping",
          );
          // Don't update lastSeen — will retry on next poll
        }
      }

      // Persist last-seen timestamps
      await this.saveLastSeen();
    } catch (err) {
      logger.error({ err }, "Poll cycle failed");
    } finally {
      this.running = false;
    }
  }

  /**
   * Sync a single playlist mapping using the existing sync engine.
   */
  private async syncMapping(
    mapping: PlaylistMapping,
    plexTitle: string,
  ): Promise<void> {
    const { logger, sdk } = this.deps;

    logger.info(
      {
        name: mapping.name,
        plexPlaylistId: mapping.plexPlaylistId,
        cardId: mapping.cardId,
      },
      "Syncing Plex playlist to Yoto card",
    );

    const source: PlexPlaylistConfig = {
      type: "plex-playlist",
      playlistId: mapping.plexPlaylistId,
      plexUrl: this.deps.plexUrl,
      plexToken: this.deps.plexToken,
      mediaPathMapping: mapping.mediaPathMapping,
    };

    const result = await sync(
      {
        cardId: mapping.cardId,
        source,
        title: mapping.title ?? plexTitle,
        loudnorm: mapping.loudnorm,
        icon: mapping.icon,
      },
      {
        sdk,
        stateStore: this.stateStore,
        logger: logger.child({ mapping: mapping.name }),
        yotoJwt: this.deps.yotoJwt,
      },
    );

    logger.info(
      {
        name: mapping.name,
        status: result.status,
        tracksUploaded: result.tracksUploaded,
        totalTracks: result.totalTracks,
        duration: result.duration,
      },
      "Mapping sync complete",
    );
  }

  // --- Persistence for last-seen timestamps ---

  private async loadLastSeen(): Promise<void> {
    try {
      const data = await this.stateStore.load<Record<string, number>>(
        "plex-last-seen",
      );
      if (data) {
        this.lastSeen = new Map(
          Object.entries(data).map(([k, v]) => [Number(k), v as number]),
        );
        this.deps.logger.debug(
          { count: this.lastSeen.size },
          "Loaded last-seen timestamps",
        );
      }
    } catch {
      // First run or corrupted — start fresh
      this.lastSeen = new Map();
    }
  }

  private async saveLastSeen(): Promise<void> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.lastSeen) {
      obj[String(k)] = v;
    }
    await this.stateStore.save("plex-last-seen", obj);
  }
}
