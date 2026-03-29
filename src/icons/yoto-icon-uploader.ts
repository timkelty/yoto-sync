import type pino from "pino";

/**
 * Result of uploading an icon to Yoto.
 */
export interface IconUploadResult {
  /** The mediaId to reference this icon: use as "yoto:#<mediaId>" */
  mediaId: string;
}

const YOTO_API_BASE = "https://api.yotoplay.com";

/**
 * Upload 16x16 icons to the Yoto API.
 *
 * Uses the undocumented but functional endpoint:
 *   POST /media/displayIcons/user/me/upload?autoConvert=true
 *
 * The SDK doesn't expose this method, so we call the REST API directly.
 * autoConvert=true lets Yoto resize/adjust the image to 16x16 if needed.
 */
export class YotoIconUploader {
  private readonly jwt: string;
  private readonly logger?: pino.Logger;

  constructor(jwt: string, logger?: pino.Logger) {
    this.jwt = jwt;
    this.logger = logger;
  }

  /**
   * Upload a PNG image as a display icon to Yoto.
   * Returns the mediaId which can be used as display.icon16x16 = "yoto:#<mediaId>".
   */
  async upload(
    pngBuffer: Buffer,
    filename = "icon.png",
  ): Promise<IconUploadResult> {
    const url = `${YOTO_API_BASE}/media/displayIcons/user/me/upload?autoConvert=true&filename=${encodeURIComponent(filename)}`;

    this.logger?.debug({ filename, size: pngBuffer.length }, "Uploading icon to Yoto");

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pngBuffer)], { type: "image/png" });
    formData.append("file", blob, filename);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed to upload icon to Yoto: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const data = (await response.json()) as {
      mediaId?: string;
      displayIconId?: string;
    };

    const mediaId = data.mediaId ?? data.displayIconId;
    if (!mediaId) {
      throw new Error(
        `Yoto icon upload succeeded but response missing mediaId: ${JSON.stringify(data)}`,
      );
    }

    this.logger?.info({ mediaId, filename }, "Icon uploaded to Yoto");

    return { mediaId };
  }
}
