/**
 * A single track as seen by a playlist source adapter.
 * Source-agnostic — adapters normalize their data into this shape.
 */
export interface AdapterTrack {
  /** Stable identifier for this track within the source (e.g. relative file path) */
  sourceId: string;

  /** Human-readable title */
  title: string;

  /**
   * URI the sync engine uses to read the audio content.
   * For LocalDirectoryAdapter: absolute file path.
   * For future adapters: could be an HTTP URL, Plex media key, etc.
   */
  sourceUri: string;

  /** Sort key for ordering (for local dir: filename) */
  sortKey: string;

  /** SHA-256 hex hash of the audio file content */
  contentHash: string;

  /** File size in bytes */
  fileSize: number;

  /** Original filename including extension */
  filename: string;
}

/**
 * Configuration for a local directory source.
 */
export interface LocalDirectoryConfig {
  type: "local-directory";
  /** Absolute path to the directory containing audio files */
  path: string;
}

/**
 * Union of all adapter configs. Grows as adapters are added.
 */
export type AdapterConfig = LocalDirectoryConfig;

/**
 * The contract every playlist source adapter must implement.
 */
export interface PlaylistSource {
  /** Identifier for the adapter type */
  readonly type: string;

  /**
   * Scan the source and return an ordered list of tracks.
   * Tracks MUST be returned in their intended playback order.
   */
  getTracks(): Promise<AdapterTrack[]>;

  /**
   * Read the raw audio content for a given track.
   */
  readTrackContent(track: AdapterTrack): Promise<Buffer>;
}

/** Audio file extensions the system supports */
export const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".aac",
  ".m4a",
  ".alac",
  ".flac",
  ".opus",
  ".ogg",
  ".wav",
  ".aiff",
]);
