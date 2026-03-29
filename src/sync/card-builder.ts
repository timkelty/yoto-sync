import type { AdapterTrack } from "../adapters/types.js";
import type {
  YotoCardUpdate,
  YotoChapter,
  YotoDisplay,
  YotoTrack,
} from "../types/yoto.js";

/**
 * Build a complete Yoto card update payload from adapter tracks
 * and their corresponding Yoto hashes.
 *
 * MVP: produces a single chapter containing all tracks.
 */
export function buildCardUpdate(
  cardId: string,
  title: string,
  tracks: AdapterTrack[],
  yotoHashes: Map<string, string>,
  display?: YotoDisplay,
): YotoCardUpdate {
  const yotoTracks: YotoTrack[] = tracks.map((track, index) => {
    const hash = yotoHashes.get(track.sourceId);
    if (!hash) {
      throw new Error(
        `Missing Yoto hash for track "${track.sourceId}". ` +
          "This is a bug in the sync engine.",
      );
    }

    return {
      key: String(index + 1).padStart(2, "0"),
      title: track.title,
      trackUrl: `yoto:#${hash}`,
      type: "audio" as const,
      fileSize: track.fileSize,
    };
  });

  const chapter: YotoChapter = {
    key: "01",
    title,
    ...(display && { display }),
    tracks: yotoTracks,
  };

  return {
    cardId,
    title,
    content: {
      chapters: [chapter],
      config: {
        autoadvance: "next",
      },
      playbackType: "linear",
    },
    metadata: {
      category: "music",
    },
  };
}
