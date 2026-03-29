import type pino from "pino";

/**
 * A single icon result from yotoicons.com.
 */
export interface YotoIconResult {
  /** Numeric icon ID on yotoicons.com */
  id: string;
  /** Category tag (e.g. "animals", "objects") */
  category: string;
  /** Primary descriptive tag */
  tag1: string;
  /** Secondary descriptive tag */
  tag2: string;
  /** Author username */
  author: string;
  /** Download count */
  downloads: number;
  /** Direct URL to the 16x16 PNG */
  imageUrl: string;
}

const YOTOICONS_BASE = "https://yotoicons.com";

/**
 * Client for searching and fetching icons from yotoicons.com.
 *
 * yotoicons.com is a community site — no official API exists.
 * We scrape the search results page, which embeds icon data in
 * onclick handlers: populate_icon_modal(id, category, tag1, tag2, author, downloads)
 */
export class YotoIconsClient {
  private readonly logger?: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger;
  }

  /**
   * Search for icons by tag/keyword. Returns results sorted by popularity.
   * Returns an empty array if no results or on error.
   */
  async search(query: string, limit = 5): Promise<YotoIconResult[]> {
    const url = `${YOTOICONS_BASE}/icons?tag=${encodeURIComponent(query)}&sort=popular&type=singles`;

    this.logger?.debug({ query, url }, "Searching yotoicons.com");

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent": "yoto-sync/1.0",
        },
      });

      if (!response.ok) {
        this.logger?.warn(
          { status: response.status, query },
          "yotoicons.com search returned non-OK status",
        );
        return [];
      }

      const html = await response.text();
      return this.parseResults(html, limit);
    } catch (err) {
      this.logger?.warn(
        { err, query },
        "Failed to search yotoicons.com",
      );
      return [];
    }
  }

  /**
   * Download an icon PNG by its ID.
   * Returns the raw PNG buffer, or null on failure.
   */
  async downloadIcon(iconId: string): Promise<Buffer | null> {
    const url = `${YOTOICONS_BASE}/static/uploads/${iconId}.png`;

    this.logger?.debug({ iconId, url }, "Downloading icon from yotoicons.com");

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "yoto-sync/1.0",
        },
      });

      if (!response.ok) {
        this.logger?.warn(
          { status: response.status, iconId },
          "Failed to download icon",
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      this.logger?.warn({ err, iconId }, "Failed to download icon");
      return null;
    }
  }

  /**
   * Parse icon results from the yotoicons.com HTML.
   *
   * Each icon is rendered with an onclick handler:
   *   populate_icon_modal('id', 'category', 'tag1', 'tag2', 'author', downloads)
   */
  private parseResults(html: string, limit: number): YotoIconResult[] {
    const results: YotoIconResult[] = [];

    // Match: populate_icon_modal('id', 'category', 'tag1', 'tag2', 'author', 'downloads')
    const regex = /populate_icon_modal\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'(\d+)'\s*\)/g;

    let match;
    while ((match = regex.exec(html)) !== null && results.length < limit) {
      const [, id, category, tag1, tag2, author, downloads] = match;
      if (id) {
        results.push({
          id: id,
          category: category ?? "",
          tag1: tag1 ?? "",
          tag2: tag2 ?? "",
          author: author ?? "",
          downloads: parseInt(downloads ?? "0", 10),
          imageUrl: `${YOTOICONS_BASE}/static/uploads/${id}.png`,
        });
      }
    }

    this.logger?.debug(
      { resultCount: results.length },
      "Parsed yotoicons.com results",
    );

    return results;
  }
}
