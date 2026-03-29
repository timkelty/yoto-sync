import type pino from "pino";
import type { IconCache } from "./icon-cache.js";
import type { YotoIconsClient } from "./yotoicons-client.js";
import type { YotoIconUploader } from "./yoto-icon-uploader.js";

export interface IconResolverDeps {
  iconsClient: YotoIconsClient;
  uploader: YotoIconUploader;
  cache: IconCache;
  logger: pino.Logger;
}

/**
 * A resolved icon ready to be set on a chapter's display.
 */
export interface ResolvedIcon {
  /** Full display reference: "yoto:#<mediaId>" */
  icon16x16: string;
}

/**
 * Orchestrates icon resolution: keyword extraction → search → download → upload → cache.
 *
 * Accepts an `iconConfig` that can be:
 * - `undefined` — auto-derive search term from the card title
 * - `"yoto:#<mediaId>"` — already-uploaded reference, pass through
 * - `"yotoicon:<id>"` — download a specific icon by yotoicons.com ID
 * - any other string — use as a search query on yotoicons.com
 * - `false` — explicitly disable icons
 *
 * Never throws — returns `null` on any failure.
 */
export class IconResolver {
  private readonly deps: IconResolverDeps;

  constructor(deps: IconResolverDeps) {
    this.deps = deps;
  }

  /**
   * Resolve an icon for a card.
   *
   * @param iconConfig - The icon field from SyncRequest/PlaylistMapping
   * @param title - Card title, used for automatic keyword extraction
   * @returns ResolvedIcon or null if resolution fails/disabled
   */
  async resolve(
    iconConfig: string | false | undefined,
    title: string,
  ): Promise<ResolvedIcon | null> {
    const { logger } = this.deps;

    // Explicitly disabled
    if (iconConfig === false) {
      return null;
    }

    // Already a yoto media reference — pass through
    if (iconConfig?.startsWith("yoto:#")) {
      return { icon16x16: iconConfig };
    }

    // Specific yotoicons.com icon ID
    if (iconConfig?.startsWith("yotoicon:")) {
      const iconId = iconConfig.slice("yotoicon:".length);
      return this.downloadAndUpload(iconId, iconConfig);
    }

    // Search query: explicit or derived from title
    const searchTerm = iconConfig ?? this.extractSearchTerm(title);
    if (!searchTerm) {
      logger.debug({ title }, "No search term derivable from title");
      return null;
    }

    return this.searchAndUpload(searchTerm);
  }

  /**
   * Extract a search term from a card/playlist title.
   *
   * Strategy: strip common noise words, return the first meaningful word.
   * yotoicons.com tag search works best with single concrete nouns.
   *
   * Examples:
   *   "Oliver's Dinosaur Songs" → "dinosaur"
   *   "Bedtime Lullabies"      → "bedtime"
   *   "The Best of 2024"       → null (all noise)
   */
  extractSearchTerm(title: string): string | null {
    const noise = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "of",
      "for",
      "to",
      "in",
      "on",
      "my",
      "our",
      "his",
      "her",
      "its",
      "vol",
      "volume",
      "mix",
      "playlist",
      "songs",
      "tracks",
      "hits",
      "best",
      "top",
      "great",
      "favorite",
      "favourites",
      "favorites",
      "kids",
      "kid",
      "children",
    ]);

    const words = title
      .toLowerCase()
      .replace(/['']/g, "") // strip apostrophes
      .replace(/[^a-z0-9\s]/g, " ") // remove punctuation
      .split(/\s+/)
      .filter((w) => w.length > 1 && !noise.has(w) && !/^\d+$/.test(w));

    return words[0] ?? null;
  }

  private async searchAndUpload(
    searchTerm: string,
  ): Promise<ResolvedIcon | null> {
    const { cache, iconsClient, logger } = this.deps;

    // Check cache first
    const cached = await cache.get(searchTerm);
    if (cached) {
      logger.debug({ searchTerm, mediaId: cached.mediaId }, "Icon cache hit");
      return { icon16x16: `yoto:#${cached.mediaId}` };
    }

    // Search yotoicons.com
    const results = await iconsClient.search(searchTerm, 1);
    if (results.length === 0) {
      logger.info({ searchTerm }, "No icons found for search term");
      return null;
    }

    const bestMatch = results[0]!;
    return this.downloadAndUpload(bestMatch.id, searchTerm);
  }

  private async downloadAndUpload(
    yotoIconId: string,
    cacheKey: string,
  ): Promise<ResolvedIcon | null> {
    const { iconsClient, uploader, cache, logger } = this.deps;

    try {
      // Download PNG from yotoicons.com
      const pngBuffer = await iconsClient.downloadIcon(yotoIconId);
      if (!pngBuffer) {
        logger.warn({ yotoIconId }, "Failed to download icon");
        return null;
      }

      // Upload to Yoto
      const { mediaId } = await uploader.upload(
        pngBuffer,
        `icon-${yotoIconId}.png`,
      );

      // Cache the result
      await cache.set(cacheKey, { yotoIconId, mediaId });

      logger.info(
        { yotoIconId, mediaId, cacheKey },
        "Icon resolved and uploaded",
      );
      return { icon16x16: `yoto:#${mediaId}` };
    } catch (err) {
      logger.warn(
        { err, yotoIconId },
        "Icon resolution failed, proceeding without icon",
      );
      return null;
    }
  }
}
