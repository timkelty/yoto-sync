import { createHash } from "node:crypto";
import type { AdapterTrack } from "../adapters/types.js";
import type { SyncSnapshot, SyncedTrackEntry } from "../types/sync.js";

/**
 * Result of comparing two snapshots.
 */
export interface SnapshotDiff {
  /** Tracks present in current but not in previous */
  added: AdapterTrack[];
  /** Tracks with the same sourceId but different contentHash */
  changed: AdapterTrack[];
  /** Tracks present in previous but not in current */
  removed: SyncedTrackEntry[];
  /** Tracks with matching sourceId and contentHash */
  unchanged: AdapterTrack[];
  /** True if any tracks were added, changed, removed, or reordered */
  hasChanges: boolean;
  /** True if the track ordering differs (even if content is identical) */
  orderChanged: boolean;
}

/**
 * Compute a snapshot hash from an ordered list of adapter tracks.
 * The hash is order-sensitive — a different order produces a different hash.
 */
export function computeSnapshotHash(tracks: AdapterTrack[]): string {
  const content = tracks
    .map((t) => `${t.sourceId}:${t.contentHash}`)
    .join("|");
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Diff two snapshots to determine what changed.
 * If `previous` is null (first sync), all tracks are "added".
 */
export function diffSnapshots(
  currentTracks: AdapterTrack[],
  previous: SyncSnapshot | null,
): SnapshotDiff {
  if (!previous) {
    return {
      added: currentTracks,
      changed: [],
      removed: [],
      unchanged: [],
      hasChanges: currentTracks.length > 0,
      orderChanged: false,
    };
  }

  // Quick path: if snapshot hashes match, nothing changed
  const currentHash = computeSnapshotHash(currentTracks);
  if (currentHash === previous.snapshotHash) {
    return {
      added: [],
      changed: [],
      removed: [],
      unchanged: currentTracks,
      hasChanges: false,
      orderChanged: false,
    };
  }

  const previousMap = new Map(
    previous.tracks.map((t) => [t.sourceId, t]),
  );

  const added: AdapterTrack[] = [];
  const changed: AdapterTrack[] = [];
  const unchanged: AdapterTrack[] = [];
  const seenSourceIds = new Set<string>();

  for (const track of currentTracks) {
    seenSourceIds.add(track.sourceId);
    const prev = previousMap.get(track.sourceId);

    if (!prev) {
      added.push(track);
    } else if (prev.contentHash !== track.contentHash) {
      changed.push(track);
    } else {
      unchanged.push(track);
    }
  }

  const removed = previous.tracks.filter(
    (t) => !seenSourceIds.has(t.sourceId),
  );

  // Check order: compare sourceId sequences
  const currentOrder = currentTracks.map((t) => t.sourceId);
  const previousOrder = previous.tracks.map((t) => t.sourceId);
  const orderChanged =
    currentOrder.length !== previousOrder.length ||
    currentOrder.some((id, i) => id !== previousOrder[i]);

  return {
    added,
    changed,
    removed,
    unchanged,
    hasChanges:
      added.length > 0 ||
      changed.length > 0 ||
      removed.length > 0 ||
      orderChanged,
    orderChanged,
  };
}
