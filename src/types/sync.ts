import type { AdapterConfig } from "../adapters/types.js";

/**
 * A point-in-time record of what was last synced to a card.
 */
export interface SyncSnapshot {
  /** ISO-8601 timestamp of when this sync completed */
  syncedAt: string;

  /** Ordered list of track fingerprints at time of sync */
  tracks: SyncedTrackEntry[];

  /** Hash of the entire ordered track list for quick equality check */
  snapshotHash: string;
}

export interface SyncedTrackEntry {
  /** Stable source ID (matches AdapterTrack.sourceId) */
  sourceId: string;

  /** Content hash at time of sync */
  contentHash: string;

  /** Title at time of sync */
  title: string;

  /** The transcodedSha256 returned by Yoto after upload */
  yotoHash: string;
}

/**
 * Request body for POST /sync.
 */
export interface SyncRequest {
  /** The Yoto card ID to sync to */
  cardId: string;

  /** Adapter configuration (which source, where to read from) */
  source: AdapterConfig;

  /** Optional: override the card/chapter title */
  title?: string;

  /** Whether to apply loudness normalization during transcode */
  loudnorm?: boolean;

  /** Icon override: search query, "yotoicon:<id>", "yoto:#<mediaId>", or false to disable */
  icon?: string | false;
}

/**
 * Response from a sync operation.
 */
export interface SyncResult {
  status: "synced" | "no-changes" | "error";
  cardId: string;
  tracksUploaded: number;
  tracksUnchanged: number;
  tracksRemoved: number;
  totalTracks: number;
  /** Duration in milliseconds */
  duration: number;
  error?: string;
}
