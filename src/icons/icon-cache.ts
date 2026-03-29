import type { StateStore } from "../state/store.js";

/**
 * A cached icon mapping: search term → uploaded Yoto icon.
 */
export interface IconCacheEntry {
  /** The yotoicons.com icon ID that was downloaded */
  yotoIconId: string;
  /** The Yoto mediaId returned after upload */
  mediaId: string;
}

/** Persisted cache: searchTerm → IconCacheEntry */
export type IconCacheData = Record<string, IconCacheEntry>;

const CACHE_KEY = "icon-cache";

/**
 * Cache layer for icon resolution.
 * Avoids re-searching yotoicons.com and re-uploading to Yoto
 * when the same search term is resolved again.
 *
 * Stored as DATA_DIR/icon-cache.json via StateStore.
 */
export class IconCache {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  /**
   * Look up a cached icon by search term.
   * Returns null on miss.
   */
  async get(searchTerm: string): Promise<IconCacheEntry | null> {
    const data = await this.stateStore.load<IconCacheData>(CACHE_KEY);
    return data?.[searchTerm] ?? null;
  }

  /**
   * Store a resolved icon in the cache.
   */
  async set(searchTerm: string, entry: IconCacheEntry): Promise<void> {
    const data =
      (await this.stateStore.load<IconCacheData>(CACHE_KEY)) ?? {};
    data[searchTerm] = entry;
    await this.stateStore.save(CACHE_KEY, data);
  }
}
