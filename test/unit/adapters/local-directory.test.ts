import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalDirectoryAdapter } from "../../../src/adapters/local-directory.js";

describe("LocalDirectoryAdapter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "yoto-sync-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns tracks sorted by filename", async () => {
    await writeFile(join(tempDir, "02-beta.mp3"), "audio-content-beta");
    await writeFile(join(tempDir, "01-alpha.mp3"), "audio-content-alpha");
    await writeFile(join(tempDir, "03-gamma.mp3"), "audio-content-gamma");

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();

    expect(tracks).toHaveLength(3);
    expect(tracks[0]!.filename).toBe("01-alpha.mp3");
    expect(tracks[1]!.filename).toBe("02-beta.mp3");
    expect(tracks[2]!.filename).toBe("03-gamma.mp3");
  });

  it("filters out non-audio files", async () => {
    await writeFile(join(tempDir, "track.mp3"), "audio");
    await writeFile(join(tempDir, "notes.txt"), "not audio");
    await writeFile(join(tempDir, "cover.jpg"), "image");
    await writeFile(join(tempDir, "song.flac"), "flac audio");

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();

    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.filename)).toEqual(["song.flac", "track.mp3"]);
  });

  it("handles all supported audio formats", async () => {
    const formats = [
      "test.mp3",
      "test.aac",
      "test.m4a",
      "test.flac",
      "test.opus",
      "test.ogg",
      "test.wav",
      "test.aiff",
    ];

    for (const file of formats) {
      await writeFile(join(tempDir, file), `content-${file}`);
    }

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(formats.length);
  });

  it("returns empty array for empty directory", async () => {
    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();
    expect(tracks).toHaveLength(0);
  });

  it("throws for non-existent directory", async () => {
    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: "/non/existent/path",
    });

    await expect(adapter.getTracks()).rejects.toThrow();
  });

  it("extracts title from filename, stripping number prefix", async () => {
    await writeFile(join(tempDir, "01 - My Track.mp3"), "audio");
    await writeFile(join(tempDir, "02_Another Song.flac"), "audio");
    await writeFile(join(tempDir, "03.Third One.ogg"), "audio");
    await writeFile(join(tempDir, "No Number.mp3"), "audio");

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();

    expect(tracks.find((t) => t.filename === "01 - My Track.mp3")!.title).toBe(
      "My Track",
    );
    expect(
      tracks.find((t) => t.filename === "02_Another Song.flac")!.title,
    ).toBe("Another Song");
    expect(tracks.find((t) => t.filename === "03.Third One.ogg")!.title).toBe(
      "Third One",
    );
    expect(tracks.find((t) => t.filename === "No Number.mp3")!.title).toBe(
      "No Number",
    );
  });

  it("computes stable content hashes", async () => {
    await writeFile(join(tempDir, "track.mp3"), "consistent-content");

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks1 = await adapter.getTracks();
    const tracks2 = await adapter.getTracks();

    expect(tracks1[0]!.contentHash).toBe(tracks2[0]!.contentHash);
    expect(tracks1[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reads track content correctly", async () => {
    const content = "test-audio-data";
    await writeFile(join(tempDir, "track.mp3"), content);

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();
    const buffer = await adapter.readTrackContent(tracks[0]!);

    expect(buffer.toString()).toBe(content);
  });

  it("sorts case-insensitively", async () => {
    await writeFile(join(tempDir, "B-track.mp3"), "b");
    await writeFile(join(tempDir, "a-track.mp3"), "a");
    await writeFile(join(tempDir, "C-track.mp3"), "c");

    const adapter = new LocalDirectoryAdapter({
      type: "local-directory",
      path: tempDir,
    });

    const tracks = await adapter.getTracks();
    expect(tracks.map((t) => t.filename)).toEqual([
      "a-track.mp3",
      "B-track.mp3",
      "C-track.mp3",
    ]);
  });
});
