import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  IconResolver,
  type IconResolverDeps,
} from "../../../src/icons/icon-resolver.js";
import { IconCache } from "../../../src/icons/icon-cache.js";
import { StateStore } from "../../../src/state/store.js";
import type { YotoIconsClient } from "../../../src/icons/yotoicons-client.js";
import type { YotoIconUploader } from "../../../src/icons/yoto-icon-uploader.js";
import pino from "pino";

function createMockClient(): YotoIconsClient {
  return {
    search: vi.fn().mockResolvedValue([]),
    downloadIcon: vi.fn().mockResolvedValue(null),
  } as unknown as YotoIconsClient;
}

function createMockUploader(): YotoIconUploader {
  return {
    upload: vi.fn().mockResolvedValue({ mediaId: "uploaded-media-id" }),
  } as unknown as YotoIconUploader;
}

describe("IconResolver", () => {
  let tempDir: string;
  let cache: IconCache;
  let logger: pino.Logger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-icon-resolver-"));
    const store = new StateStore(tempDir);
    cache = new IconCache(store);
    logger = pino({ level: "silent" });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function createResolver(overrides: Partial<IconResolverDeps> = {}): {
    resolver: IconResolver;
    deps: IconResolverDeps;
  } {
    const deps: IconResolverDeps = {
      iconsClient: createMockClient(),
      uploader: createMockUploader(),
      cache,
      logger,
      ...overrides,
    };
    return { resolver: new IconResolver(deps), deps };
  }

  describe("resolve", () => {
    it("returns null when icon is explicitly disabled (false)", async () => {
      const { resolver } = createResolver();
      const result = await resolver.resolve(false, "Some Title");
      expect(result).toBeNull();
    });

    it("passes through yoto:# references without network calls", async () => {
      const client = createMockClient();
      const uploader = createMockUploader();
      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve("yoto:#existing-media-id", "Title");

      expect(result).toEqual({ icon16x16: "yoto:#existing-media-id" });
      expect(client.search).not.toHaveBeenCalled();
      expect(client.downloadIcon).not.toHaveBeenCalled();
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it("downloads and uploads a specific yotoicon: ID", async () => {
      const client = createMockClient();
      const uploader = createMockUploader();
      const pngBuffer = Buffer.from("fake-png-data");

      vi.mocked(client.downloadIcon).mockResolvedValue(pngBuffer);
      vi.mocked(uploader.upload).mockResolvedValue({ mediaId: "new-media-42" });

      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve("yotoicon:42", "Title");

      expect(result).toEqual({ icon16x16: "yoto:#new-media-42" });
      expect(client.downloadIcon).toHaveBeenCalledWith("42");
      expect(uploader.upload).toHaveBeenCalledWith(pngBuffer, "icon-42.png");
      expect(client.search).not.toHaveBeenCalled();
    });

    it("searches and uploads when given a query string", async () => {
      const client = createMockClient();
      const uploader = createMockUploader();
      const pngBuffer = Buffer.from("fake-png");

      vi.mocked(client.search).mockResolvedValue([
        {
          id: "99",
          category: "animals",
          tag1: "dinosaur",
          tag2: "",
          author: "test",
          downloads: 100,
          imageUrl: "https://yotoicons.com/static/uploads/99.png",
        },
      ]);
      vi.mocked(client.downloadIcon).mockResolvedValue(pngBuffer);
      vi.mocked(uploader.upload).mockResolvedValue({ mediaId: "media-99" });

      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve("dinosaur", "Title");

      expect(result).toEqual({ icon16x16: "yoto:#media-99" });
      expect(client.search).toHaveBeenCalledWith("dinosaur", 1);
      expect(client.downloadIcon).toHaveBeenCalledWith("99");
    });

    it("returns cached result on cache hit (no network calls)", async () => {
      // Pre-populate cache
      await cache.set("dinosaur", {
        yotoIconId: "99",
        mediaId: "cached-media-id",
      });

      const client = createMockClient();
      const uploader = createMockUploader();
      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve("dinosaur", "Title");

      expect(result).toEqual({ icon16x16: "yoto:#cached-media-id" });
      expect(client.search).not.toHaveBeenCalled();
      expect(client.downloadIcon).not.toHaveBeenCalled();
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it("derives search term from title when iconConfig is undefined", async () => {
      const client = createMockClient();
      const uploader = createMockUploader();
      const pngBuffer = Buffer.from("fake");

      vi.mocked(client.search).mockResolvedValue([
        {
          id: "50",
          category: "animals",
          tag1: "dinosaur",
          tag2: "",
          author: "test",
          downloads: 50,
          imageUrl: "https://yotoicons.com/static/uploads/50.png",
        },
      ]);
      vi.mocked(client.downloadIcon).mockResolvedValue(pngBuffer);
      vi.mocked(uploader.upload).mockResolvedValue({ mediaId: "media-50" });

      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve(undefined, "Dinosaur Adventures");

      expect(result).toEqual({ icon16x16: "yoto:#media-50" });
      expect(client.search).toHaveBeenCalledWith("dinosaur", 1);
    });

    it("returns null when search returns empty results", async () => {
      const client = createMockClient();
      vi.mocked(client.search).mockResolvedValue([]);

      const { resolver } = createResolver({ iconsClient: client });

      const result = await resolver.resolve("nonexistent", "Title");
      expect(result).toBeNull();
    });

    it("returns null when icon download fails", async () => {
      const client = createMockClient();
      vi.mocked(client.search).mockResolvedValue([
        {
          id: "1",
          category: "",
          tag1: "",
          tag2: "",
          author: "",
          downloads: 0,
          imageUrl: "https://yotoicons.com/static/uploads/1.png",
        },
      ]);
      vi.mocked(client.downloadIcon).mockResolvedValue(null);

      const { resolver } = createResolver({ iconsClient: client });

      const result = await resolver.resolve("test", "Title");
      expect(result).toBeNull();
    });

    it("returns null when upload fails (non-fatal)", async () => {
      const client = createMockClient();
      const uploader = createMockUploader();

      vi.mocked(client.search).mockResolvedValue([
        {
          id: "1",
          category: "",
          tag1: "",
          tag2: "",
          author: "",
          downloads: 0,
          imageUrl: "https://yotoicons.com/static/uploads/1.png",
        },
      ]);
      vi.mocked(client.downloadIcon).mockResolvedValue(Buffer.from("png"));
      vi.mocked(uploader.upload).mockRejectedValue(new Error("Upload failed"));

      const { resolver } = createResolver({
        iconsClient: client,
        uploader,
      });

      const result = await resolver.resolve("test", "Title");
      expect(result).toBeNull();
    });

    it("returns null when title yields no search term", async () => {
      const { resolver } = createResolver();

      const result = await resolver.resolve(undefined, "The Best of 2024");
      expect(result).toBeNull();
    });
  });

  describe("extractSearchTerm", () => {
    it("extracts first meaningful word from title", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("Dinosaur Adventures")).toBe(
        "dinosaur",
      );
    });

    it("skips noise words", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("The Great Dinosaur Songs")).toBe(
        "dinosaur",
      );
    });

    it("strips apostrophes", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("Oliver's Dinosaur Songs")).toBe(
        "olivers",
      );
    });

    it("returns null for all-noise titles", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("The Best of 2024")).toBeNull();
    });

    it("returns null for empty string", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("")).toBeNull();
    });

    it("returns null for single-char words", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("A")).toBeNull();
    });

    it("ignores numeric-only words", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("2024 Space Odyssey")).toBe("space");
    });

    it("handles punctuation gracefully", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("Rock & Roll!")).toBe("rock");
    });

    it("is case-insensitive", () => {
      const { resolver } = createResolver();
      expect(resolver.extractSearchTerm("DINOSAUR")).toBe("dinosaur");
    });
  });
});
