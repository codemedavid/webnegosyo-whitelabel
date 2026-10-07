/** Limits the browser also enforces. Kept apart from config.ts, which reads server env. */

/** Characters an owner can type in one message. */
export const MAX_INPUT_CHARS = 2000

/** Menu photos one message can carry. */
export const MAX_PHOTOS_PER_MESSAGE = 3
/**
 * One photo as a data URL, in characters (~2.2MB of JPEG). Browsers shrink a
 * photo to PHOTO_MAX_EDGE_PX first and land far below this; the merchant app
 * can only re-compress (no resize module in its binary), so a phone photo
 * arrives near ~1MB.
 */
export const MAX_PHOTO_DATA_URL_CHARS = 3_000_000
/** Every photo of one message together: the request must stay under the host's 4.5MB body cap. */
export const MAX_PHOTOS_TOTAL_CHARS = 4_000_000
/** Longest side a browser resizes a photo to — still sharp enough to read menu prices. */
export const PHOTO_MAX_EDGE_PX = 1600
/** What a photo-only message says, so the model knows what the owner wants. */
export const PHOTO_ONLY_TEXT = 'Add the dishes in this photo to my menu.'

/** Longest voice note the mic records before it stops on its own. */
export const MAX_VOICE_SECONDS = 60
/** Largest voice upload, in bytes: a minute of compressed speech is well under 1MB. */
export const MAX_VOICE_BYTES = 4_000_000
