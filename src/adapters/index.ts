import { LocalDirectoryAdapter } from "./local-directory.js";
import { PlexPlaylistAdapter } from "./plex-playlist.js";
import type { AdapterConfig, PlaylistSource } from "./types.js";

export type { PlaylistSource, AdapterTrack, AdapterConfig } from "./types.js";
export { LocalDirectoryAdapter } from "./local-directory.js";
export { PlexPlaylistAdapter } from "./plex-playlist.js";

/**
 * Factory: create the appropriate adapter from config.
 * When new adapter types are added to AdapterConfig, the switch
 * must be extended — TypeScript will enforce exhaustiveness.
 */
export function createAdapter(config: AdapterConfig): PlaylistSource {
  switch (config.type) {
    case "local-directory":
      return new LocalDirectoryAdapter(config);
    case "plex-playlist":
      return new PlexPlaylistAdapter(config);
    default:
      throw new Error(`Unknown adapter type: ${String((config as { type: string }).type)}`);
  }
}
