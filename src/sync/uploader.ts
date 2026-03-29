import { createHash } from "node:crypto";
import type { YotoSdk } from "@yotoplay/yoto-sdk";
import type { AdapterTrack } from "../adapters/types.js";
import type pino from "pino";

/**
 * Upload a single track to Yoto and return the transcodedSha256.
 *
 * Flow:
 * 1. Compute SHA-256 of the audio buffer
 * 2. Request upload URL (may be null if already uploaded — dedup)
 * 3. Upload file if needed
 * 4. Poll for transcoding completion
 * 5. Return the transcodedSha256 for use in trackUrl
 */
export async function uploadTrack(
  sdk: YotoSdk,
  track: AdapterTrack,
  audioBuffer: Buffer,
  loudnorm: boolean,
  logger: pino.Logger,
): Promise<string> {
  const sha256 = createHash("sha256").update(audioBuffer).digest("hex");

  logger.debug({ sourceId: track.sourceId, sha256 }, "Requesting upload URL");

  const upload = await sdk.media.getUploadUrlForTranscode(
    sha256,
    track.filename,
  );

  if (upload.uploadUrl) {
    logger.debug(
      { sourceId: track.sourceId, uploadId: upload.uploadId },
      "Uploading audio file",
    );
    await sdk.media.uploadFile(upload.uploadUrl, audioBuffer);
  } else {
    logger.debug(
      { sourceId: track.sourceId },
      "File already uploaded (dedup), skipping upload",
    );
  }

  // Poll for transcoding completion
  const transcoded = await pollForTranscode(
    sdk,
    upload.uploadId,
    loudnorm,
    logger,
  );

  return transcoded;
}

/**
 * Poll the Yoto API until transcoding completes.
 * Returns the transcoded URL which contains the hash.
 */
async function pollForTranscode(
  sdk: YotoSdk,
  uploadId: string,
  loudnorm: boolean,
  logger: pino.Logger,
): Promise<string> {
  const maxAttempts = 60;
  const initialDelay = 1000;
  const maxDelay = 10_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = Math.min(initialDelay * Math.pow(1.5, attempt - 1), maxDelay);
    await sleep(delay);

    try {
      const result = await sdk.media.getTranscodedUpload(uploadId, loudnorm);

      if (result.status === "completed" && result.url) {
        // Extract the hash from the URL. The URL format from Yoto
        // contains the transcoded file reference.
        const hash = extractHashFromUrl(result.url);
        logger.debug(
          { uploadId, hash, attempt },
          "Transcoding completed",
        );
        return hash;
      }

      logger.debug(
        { uploadId, status: result.status, attempt },
        "Transcoding in progress",
      );
    } catch (err) {
      // Transient errors during polling are expected — keep trying
      logger.debug(
        { uploadId, attempt, err },
        "Transcode poll attempt failed",
      );
    }
  }

  throw new Error(
    `Transcoding timed out for upload ${uploadId} after ${maxAttempts} attempts`,
  );
}

/**
 * Extract the SHA256 hash from a Yoto transcoded media URL.
 * The URL typically ends with the hash or contains it as a path segment.
 */
function extractHashFromUrl(url: string): string {
  // The URL format from the transcode endpoint contains the file hash.
  // Try to extract it from the URL path — the last path segment
  // before any query params is typically the hash-based filename.
  const urlObj = new URL(url);
  const segments = urlObj.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  if (lastSegment) {
    // Strip file extension if present
    const hash = lastSegment.replace(/\.[^.]+$/, "");
    if (/^[a-f0-9]{64}$/i.test(hash)) {
      return hash;
    }
  }

  // Fallback: use the full URL as the reference
  // This handles edge cases where the URL format is unexpected
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
