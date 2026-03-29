import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createHash } from "node:crypto";
import { PlexAPI } from "@lukehagar/plexjs";
import type {
  PlaylistSource,
  AdapterTrack,
  PlexPlaylistConfig,
} from "./types.js";
import { SUPPORTED_EXTENSIONS } from "./types.js";

/**
 * Playlist source that reads tracks from a Plex playlist.
 *
 * Reads audio content directly from the filesystem (Plex media dir
 * must be mounted / accessible from this host). This is the approach
 * for Unraid deployments where the Plex media directory is mounted
 * into the Docker container.
 */
export class PlexPlaylistAdapter implements PlaylistSource {
  readonly type = "plex-playlist";
  private readonly config: PlexPlaylistConfig;
  private readonly plex: PlexAPI;

  constructor(config: PlexPlaylistConfig) {
    this.config = config;
    this.plex = new PlexAPI({
      serverURL: config.plexUrl,
      token: config.plexToken,
    });
  }

  async getTracks(): Promise<AdapterTrack[]> {
    const response = await this.plex.playlist.getPlaylistItems({
      playlistId: this.config.playlistId,
    });

    const metadata =
      response.mediaContainerWithMetadata?.mediaContainer?.metadata ?? [];

    const tracks: AdapterTrack[] = [];

    for (let i = 0; i < metadata.length; i++) {
      const item = metadata[i]!;
      const filePath = item.media?.[0]?.part?.[0]?.file as string | undefined;

      if (!filePath) {
        // Skip items with no file path (e.g. Tidal tracks, missing media)
        continue;
      }

      const ext = extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        continue;
      }

      const localPath = this.mapFilePath(filePath);
      const ratingKey = String(item.ratingKey ?? "");
      const title = this.buildTrackTitle(item);

      // Read file content for hashing
      const fileContent = await readFile(localPath);
      const contentHash = createHash("sha256")
        .update(fileContent)
        .digest("hex");

      tracks.push({
        sourceId: `plex:${ratingKey}`,
        title,
        sourceUri: localPath,
        // Use playlist order (array index) as sort key
        sortKey: String(i).padStart(6, "0"),
        contentHash,
        fileSize: fileContent.length,
        filename: localPath.split("/").pop() ?? ratingKey,
      });
    }

    return tracks;
  }

  async readTrackContent(track: AdapterTrack): Promise<Buffer> {
    return readFile(track.sourceUri);
  }

  /**
   * Map a Plex file path to a local path using the configured path mapping.
   * If no mapping is configured, the path is returned as-is.
   */
  private mapFilePath(plexPath: string): string {
    const mapping = this.config.mediaPathMapping;
    if (!mapping) {
      return plexPath;
    }

    if (plexPath.startsWith(mapping.from)) {
      return mapping.to + plexPath.slice(mapping.from.length);
    }

    return plexPath;
  }

  /**
   * Build a human-readable title from Plex track metadata.
   * Prefers "Artist - Title", falls back to just the title.
   */
  private buildTrackTitle(item: {
    title?: unknown;
    grandparentTitle?: unknown;
    parentTitle?: unknown;
    index?: unknown;
  }): string {
    const title = String(item.title ?? "Unknown Track");
    const artist = item.grandparentTitle
      ? String(item.grandparentTitle)
      : undefined;

    if (artist) {
      return `${artist} - ${title}`;
    }

    return title;
  }
}
