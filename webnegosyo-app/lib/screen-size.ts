/**
 * Device-class questions answered from the window size alone.
 *
 * Deliberately NOT `expo-device`: a merchant's "tablet" is whatever has room
 * for a two-pane register, and a large foldable opened flat has exactly that
 * room while reporting itself a phone. The window is also the thing that
 * actually changes when the device is rotated or put in a split-screen slot,
 * so sizing off it keeps the answer honest at every moment rather than only
 * at launch.
 */

/**
 * Short side, in dp/pt, at or above which a device is treated as a tablet.
 *
 * 600 is Android's own `sw600dp` boundary — the one its resource qualifiers
 * have used for "tablet" since Honeycomb. Every iPad clears it comfortably
 * (the 8.3" mini is 744pt across) and no iPhone comes close (the largest is
 * 440pt), so the same number serves both platforms.
 */
export const TABLET_MIN_SHORT_SIDE = 600;

export interface ScreenSize {
  width: number;
  height: number;
}

/** The dimension that does not change when the device is turned. */
export function shortSide({ width, height }: ScreenSize): number {
  return Math.min(width, height);
}

/** True when the window is big enough in BOTH directions to be a tablet. */
export function isTabletScreen(size: ScreenSize): boolean {
  return shortSide(size) >= TABLET_MIN_SHORT_SIDE;
}

/** What the app asks the OS to allow. Mapped to the native enum by the hook. */
export type OrientationLock = "portrait" | "all";

/**
 * Tablets turn; handsets do not.
 *
 * Merchants mount a tablet on a counter stand, and a counter stand is
 * landscape — refusing to rotate there wastes half the glass and was reported
 * as the app "only working portrait". A handset stays locked because every
 * screen in the app is drawn as a tall column and nothing is gained by
 * letting a phone lie on its side.
 */
export function orientationLockFor(size: ScreenSize): OrientationLock {
  return isTabletScreen(size) ? "all" : "portrait";
}
