/**
 * Track within a Yoto card chapter.
 */
export interface YotoTrack {
  key: string;
  title: string;
  /** Format: "yoto:#<transcodedSha256>" */
  trackUrl: string;
  type: "audio";
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
  display?: Record<string, unknown>;
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
