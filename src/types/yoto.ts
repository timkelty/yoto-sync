/**
 * Display icon for the Yoto player's 16x16 LED screen.
 * At least one of icon16x16 or iconUrl16x16 should be provided.
 */
export interface YotoDisplay {
  /** Pre-uploaded icon reference: "yoto:#<base64url-sha256>" */
  icon16x16?: string;
  /** URL to a dynamically-served 16x16 RGBA PNG */
  iconUrl16x16?: string;
}

/**
 * Track within a Yoto card chapter.
 */
export interface YotoTrack {
  key: string;
  title: string;
  /** Format: "yoto:#<transcodedSha256>" */
  trackUrl: string;
  type: "audio";
  display?: YotoDisplay;
  format?: string;
  duration?: number;
  fileSize?: number;
  channels?: number;
}

/**
 * A chapter within a Yoto card.
 */
export interface YotoChapter {
  key: string;
  title: string;
  display?: YotoDisplay;
  tracks: YotoTrack[];
}

/**
 * Content structure for a Yoto card.
 */
export interface YotoCardContent {
  chapters: YotoChapter[];
  config?: {
    autoadvance?: "next" | "repeat" | "none";
    resumeTimeout?: number;
    onlineOnly?: boolean;
  };
  playbackType?: "linear" | "interactive";
}

/**
 * Full card update payload sent to POST /content.
 * Aligns with the SDK's YotoJson type.
 */
export interface YotoCardUpdate {
  cardId: string;
  title: string;
  content: YotoCardContent;
  metadata?: Record<string, unknown>;
}
