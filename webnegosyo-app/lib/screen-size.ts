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
export type OrientationLock = "portrait" | "landscape";

/**
 * Tablets lie down; handsets stand up.
 *
 * Both are locks, in opposite directions, and neither is a preference the
 * merchant gets to override. A tablet is a counter terminal: it sits in a
 * stand, sideways, and the register is drawn for that shape — the two-pane
 * layout in `pos-layout.ts` puts the sale beside the grid rather than under
 * it. Leaving the tablet free to turn meant a staff member could knock it
 * upright mid-sale and re-flow the whole screen between two taps. A handset
 * is locked the other way for the same reason in reverse: every screen is a
 * tall column, and a phone on its side only makes that column shorter.
 *
 * Note this reads the device's size, NOT its current orientation — an iPad
 * picked up in portrait still answers "landscape", which is the whole point:
 * the lock's job is to turn it.
 */
export function orientationLockFor(size: ScreenSize): OrientationLock {
  return isTabletScreen(size) ? "landscape" : "portrait";
}
