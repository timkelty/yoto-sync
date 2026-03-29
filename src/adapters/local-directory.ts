import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import type {
  PlaylistSource,
  AdapterTrack,
  LocalDirectoryConfig,
} from "./types.js";
import { SUPPORTED_EXTENSIONS } from "./types.js";

/**
 * Playlist source that reads audio files from a local directory.
 * Files are sorted alphabetically by filename (case-insensitive).
 * Non-recursive — only reads the top-level directory.
 */
export class LocalDirectoryAdapter implements PlaylistSource {
  readonly type = "local-directory";
  private readonly dirPath: string;

  constructor(config: LocalDirectoryConfig) {
    this.dirPath = config.path;
  }

  async getTracks(): Promise<AdapterTrack[]> {
    const entries = await readdir(this.dirPath, { withFileTypes: true });

    const audioFiles = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = extname(entry.name).toLowerCase();
        return SUPPORTED_EXTENSIONS.has(ext);
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );

    const tracks: AdapterTrack[] = [];

    for (const entry of audioFiles) {
      const filePath = join(this.dirPath, entry.name);
      const fileContent = await readFile(filePath);
      const fileStat = await stat(filePath);

      const contentHash = createHash("sha256")
        .update(fileContent)
        .digest("hex");

      tracks.push({
        sourceId: entry.name,
        title: this.extractTitle(entry.name),
        sourceUri: filePath,
        sortKey: entry.name.toLowerCase(),
        contentHash,
        fileSize: fileStat.size,
        filename: entry.name,
      });
    }

    return tracks;
  }

  async readTrackContent(track: AdapterTrack): Promise<Buffer> {
    return readFile(track.sourceUri);
  }

  /**
   * Extract a human-readable title from a filename.
   * Strips:
   * - Leading numeric prefixes with optional separators (e.g. "01 - ", "01_", "01.")
   * - File extension
   */
  private extractTitle(filename: string): string {
    const withoutExt = basename(filename, extname(filename));
    // Strip leading number + separator patterns: "01 - ", "01_", "01. ", "01 "
    return withoutExt.replace(/^\d+[\s._-]+/, "").trim() || withoutExt;
  }
}
