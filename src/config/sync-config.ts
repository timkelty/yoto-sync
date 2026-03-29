import { readFile } from "node:fs/promises";
import type { PlexPlaylistConfig } from "../adapters/types.js";

/**
 * A single mapping from a Plex playlist to a Yoto card.
 */
export interface PlaylistMapping {
  /** Human-readable name for this mapping (used in logs) */
  name: string;

  /** Plex playlist ratingKey (numeric ID) */
  plexPlaylistId: number;

  /** Yoto card ID to sync to */
  cardId: string;

  /** Optional: override the card title */
  title?: string;

  /** Optional: apply loudness normalization */
  loudnorm?: boolean;

  /** Optional: icon override — search query, "yotoicon:<id>", "yoto:#<mediaId>", or false to disable */
  icon?: string | false;

  /** Optional: path mapping for Plex media files */
  mediaPathMapping?: PlexPlaylistConfig["mediaPathMapping"];
}

/**
 * Top-level sync configuration file schema.
 */
export interface SyncConfig {
  /** Plex playlist → Yoto card mappings */
  mappings: PlaylistMapping[];
}

/**
 * Load and validate the sync config file.
 * Throws on missing file, invalid JSON, or schema violations.
 */
export async function loadSyncConfig(filePath: string): Promise<SyncConfig> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read sync config at ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Sync config at ${filePath} is not valid JSON`);
  }

  return validateSyncConfig(parsed, filePath);
}

/**
 * Validate the parsed JSON against the SyncConfig schema.
 */
function validateSyncConfig(data: unknown, filePath: string): SyncConfig {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Sync config at ${filePath}: expected an object at root`);
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj["mappings"])) {
    throw new Error(
      `Sync config at ${filePath}: "mappings" must be an array`,
    );
  }

  const mappings: PlaylistMapping[] = [];

  for (let i = 0; i < obj["mappings"].length; i++) {
    const entry = obj["mappings"][i] as Record<string, unknown>;
    const prefix = `Sync config at ${filePath}: mappings[${i}]`;

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${prefix}: expected an object`);
    }

    if (!entry["name"] || typeof entry["name"] !== "string") {
      throw new Error(`${prefix}: "name" is required (string)`);
    }

    if (typeof entry["plexPlaylistId"] !== "number" || !Number.isInteger(entry["plexPlaylistId"])) {
      throw new Error(`${prefix}: "plexPlaylistId" is required (integer)`);
    }

    if (!entry["cardId"] || typeof entry["cardId"] !== "string") {
      throw new Error(`${prefix}: "cardId" is required (string)`);
    }

    if (entry["title"] !== undefined && typeof entry["title"] !== "string") {
      throw new Error(`${prefix}: "title" must be a string if provided`);
    }

    if (entry["loudnorm"] !== undefined && typeof entry["loudnorm"] !== "boolean") {
      throw new Error(`${prefix}: "loudnorm" must be a boolean if provided`);
    }

    if (
      entry["icon"] !== undefined &&
      entry["icon"] !== false &&
      typeof entry["icon"] !== "string"
    ) {
      throw new Error(
        `${prefix}: "icon" must be a string or false if provided`,
      );
    }

    let mediaPathMapping: PlexPlaylistConfig["mediaPathMapping"];
    if (entry["mediaPathMapping"] !== undefined) {
      const mpm = entry["mediaPathMapping"] as Record<string, unknown>;
      if (!mpm || typeof mpm !== "object" || Array.isArray(mpm)) {
        throw new Error(`${prefix}: "mediaPathMapping" must be an object`);
      }
      if (typeof mpm["from"] !== "string" || typeof mpm["to"] !== "string") {
        throw new Error(
          `${prefix}: "mediaPathMapping" requires "from" and "to" strings`,
        );
      }
      mediaPathMapping = { from: mpm["from"], to: mpm["to"] };
    }

    mappings.push({
      name: entry["name"] as string,
      plexPlaylistId: entry["plexPlaylistId"] as number,
      cardId: entry["cardId"] as string,
      title: entry["title"] as string | undefined,
      loudnorm: entry["loudnorm"] as boolean | undefined,
      icon: entry["icon"] as string | false | undefined,
      mediaPathMapping,
    });
  }

  if (mappings.length === 0) {
    throw new Error(`Sync config at ${filePath}: "mappings" must not be empty`);
  }

  // Check for duplicate cardId or plexPlaylistId
  const seenCards = new Set<string>();
  const seenPlaylists = new Set<number>();
  for (const m of mappings) {
    if (seenCards.has(m.cardId)) {
      throw new Error(
        `Sync config at ${filePath}: duplicate cardId "${m.cardId}"`,
      );
    }
    seenCards.add(m.cardId);

    if (seenPlaylists.has(m.plexPlaylistId)) {
      throw new Error(
        `Sync config at ${filePath}: duplicate plexPlaylistId ${m.plexPlaylistId}`,
      );
    }
    seenPlaylists.add(m.plexPlaylistId);
  }

  return { mappings };
}
