import { basename } from "node:path";
import type { YotoSdk } from "@yotoplay/yoto-sdk";
import type pino from "pino";
import { createAdapter } from "../adapters/index.js";
import type { PlaylistSource } from "../adapters/types.js";
import { IconCache } from "../icons/icon-cache.js";
import { IconResolver } from "../icons/icon-resolver.js";
import { YotoIconUploader } from "../icons/yoto-icon-uploader.js";
import { YotoIconsClient } from "../icons/yotoicons-client.js";
import { StateStore } from "../state/store.js";
import type {
  SyncRequest,
  SyncResult,
  SyncSnapshot,
  SyncedTrackEntry,
} from "../types/sync.js";
import type { YotoDisplay } from "../types/yoto.js";
import { buildCardUpdate } from "./card-builder.js";
import { computeSnapshotHash, diffSnapshots } from "./snapshot.js";
import { uploadTrack } from "./uploader.js";

export interface SyncDeps {
  sdk: YotoSdk;
  stateStore: StateStore;
  logger: pino.Logger;
  /** JWT for Yoto API (needed for icon uploads). If absent, icons are skipped. */
  yotoJwt?: string;
}

/**
 * Core sync orchestrator.
 *
 * 1. Scan source via adapter
 * 2. Diff against last-synced snapshot
 * 3. Upload new/changed tracks
 * 4. Build and push full card update
 * 5. Save snapshot
 */
export async function sync(
  request: SyncRequest,
  deps: SyncDeps,
): Promise<SyncResult> {
  const start = Date.now();
  const { sdk, stateStore, logger } = deps;

  logger.info(
    { cardId: request.cardId, sourceType: request.source.type },
    "Starting sync",
  );

  // 1. Scan source
  const adapter: PlaylistSource = createAdapter(request.source);
  const currentTracks = await adapter.getTracks();

  logger.info(
    { trackCount: currentTracks.length },
    "Source scan complete",
  );

  if (currentTracks.length === 0) {
    return {
      status: "error",
      cardId: request.cardId,
      tracksUploaded: 0,
      tracksUnchanged: 0,
      tracksRemoved: 0,
      totalTracks: 0,
      duration: Date.now() - start,
      error: "No audio files found in source",
    };
  }

  // 2. Load previous snapshot and diff
  const previousSnapshot = await stateStore.getSnapshot(request.cardId);
  const diff = diffSnapshots(currentTracks, previousSnapshot);

  if (!diff.hasChanges) {
    logger.info("No changes detected, skipping sync");
    return {
      status: "no-changes",
      cardId: request.cardId,
      tracksUploaded: 0,
      tracksUnchanged: currentTracks.length,
      tracksRemoved: 0,
      totalTracks: currentTracks.length,
      duration: Date.now() - start,
    };
  }

  logger.info(
    {
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removed.length,
      unchanged: diff.unchanged.length,
      orderChanged: diff.orderChanged,
    },
    "Changes detected",
  );

  // 3. Build yotoHashes map — carry forward unchanged, upload new/changed
  const yotoHashes = new Map<string, string>();
  const tracksToUpload = [...diff.added, ...diff.changed];

  // Carry forward hashes for unchanged tracks
  if (previousSnapshot) {
    for (const track of diff.unchanged) {
      const prev = previousSnapshot.tracks.find(
        (t) => t.sourceId === track.sourceId,
      );
      if (prev) {
        yotoHashes.set(track.sourceId, prev.yotoHash);
      }
    }
  }

  // 4. Upload new/changed tracks (sequential to respect rate limits)
  for (let i = 0; i < tracksToUpload.length; i++) {
    const track = tracksToUpload[i]!;
    logger.info(
      {
        sourceId: track.sourceId,
        title: track.title,
        progress: `${i + 1}/${tracksToUpload.length}`,
      },
      "Uploading track",
    );

    const audioBuffer = await adapter.readTrackContent(track);
    const transcodedHash = await uploadTrack(
      sdk,
      track,
      audioBuffer,
      request.loudnorm ?? false,
      logger,
    );
    yotoHashes.set(track.sourceId, transcodedHash);
  }

  // 5. Resolve icon (non-fatal)
  const title =
    request.title ??
    deriveTitle(request.source);

  let display: YotoDisplay | undefined;
  if (deps.yotoJwt) {
    try {
      const iconCache = new IconCache(stateStore);
      const iconsClient = new YotoIconsClient(logger);
      const uploader = new YotoIconUploader(deps.yotoJwt, logger);
      const resolver = new IconResolver({
        iconsClient,
        uploader,
        cache: iconCache,
        logger,
      });

      const resolved = await resolver.resolve(request.icon, title);
      if (resolved) {
        display = resolved;
      }
    } catch (err) {
      logger.warn({ err }, "Icon resolution failed, proceeding without icon");
    }
  }

  // 6. Build card payload
  const cardUpdate = buildCardUpdate(
    request.cardId,
    title,
    currentTracks,
    yotoHashes,
    display,
  );

  // 7. Push to Yoto API
  logger.info(
    { cardId: request.cardId, trackCount: currentTracks.length },
    "Updating card",
  );

  // The SDK types use Record<string, unknown> for content/metadata.
  // Cast our strongly-typed payload to satisfy the SDK's looser type.
  await sdk.content.updateCard(
    cardUpdate as unknown as import("@yotoplay/yoto-sdk").YotoJson,
  );

  // 8. Save snapshot
  const finalSnapshot: SyncSnapshot = {
    syncedAt: new Date().toISOString(),
    snapshotHash: computeSnapshotHash(currentTracks),
    tracks: currentTracks.map(
      (t): SyncedTrackEntry => ({
        sourceId: t.sourceId,
        contentHash: t.contentHash,
        title: t.title,
        yotoHash: yotoHashes.get(t.sourceId)!,
      }),
    ),
  };

  await stateStore.saveSnapshot(request.cardId, finalSnapshot);

  const duration = Date.now() - start;
  logger.info({ duration, status: "synced" }, "Sync complete");

  return {
    status: "synced",
    cardId: request.cardId,
    tracksUploaded: tracksToUpload.length,
    tracksUnchanged: diff.unchanged.length,
    tracksRemoved: diff.removed.length,
    totalTracks: currentTracks.length,
    duration,
  };
}

/**
 * Derive a card title from the adapter config.
 */
function deriveTitle(source: import("../adapters/types.js").AdapterConfig): string {
  switch (source.type) {
    case "local-directory":
      return basename(source.path) || "My Playlist";
    case "plex-playlist":
      return `Plex Playlist ${source.playlistId}`;
    default:
      return "My Playlist";
  }
}
