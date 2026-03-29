import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { SyncSnapshot } from "../types/sync.js";

interface StateData {
  [cardId: string]: SyncSnapshot;
}

/**
 * Persist sync snapshots to a JSON file.
 * Uses atomic writes (write-to-temp + rename) to prevent corruption
 * on crash/power loss.
 */
export class StateStore {
  private readonly filePath: string;
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.filePath = join(dataDir, "state.json");
  }

  /**
   * Load the snapshot for a given card, or null if none exists.
   */
  async getSnapshot(cardId: string): Promise<SyncSnapshot | null> {
    const data = await this.loadAll();
    return data[cardId] ?? null;
  }

  /**
   * Save a snapshot for a card. Merges with existing state.
   */
  async saveSnapshot(cardId: string, snapshot: SyncSnapshot): Promise<void> {
    const data = await this.loadAll();
    data[cardId] = snapshot;
    await this.writeAll(data);
  }

  /**
   * Load arbitrary JSON data by key (stored as separate files in dataDir).
   * Returns null if the file doesn't exist.
   */
  async load<T>(key: string): Promise<T | null> {
    try {
      const filePath = join(this.dataDir, `${key}.json`);
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Save arbitrary JSON data by key (atomic write to dataDir).
   */
  async save<T>(key: string, data: T): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const filePath = join(this.dataDir, `${key}.json`);
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  }

  private async loadAll(): Promise<StateData> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as StateData;
    } catch {
      return {};
    }
  }

  private async writeAll(data: StateData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }
}
