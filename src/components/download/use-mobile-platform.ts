"use client";

import { useSyncExternalStore } from "react";

export type MobilePlatform = "ios" | "android";

function detectMobilePlatform(): MobilePlatform | null {
  const { userAgent, maxTouchPoints } = window.navigator;
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS 13+ reports itself as a Mac; only the touch screen gives it away.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}

/** The user agent never changes during a visit, so nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * The visitor's phone platform, or null on a computer and during the server
 * render (the server can't know, so both buttons render equally until
 * hydration).
 */
export function useMobilePlatform(): MobilePlatform | null {
  return useSyncExternalStore(subscribeToNothing, detectMobilePlatform, () => null);
}
