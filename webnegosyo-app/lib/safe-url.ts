// The one door through which the app opens a URL it did not author.
//
// Payment-proof links, Lalamove tracking links and announcement links arrive
// from a server or a merchant. `Linking.openURL` hands any scheme to the OS —
// `intent:`, `file:`, a custom app scheme — so only web pages, mail and phone
// numbers are allowed through. Scheme parsing is a regex rather than `URL`:
// React Native's URL polyfill is partial and its getters are not reliable.

import { Linking } from "react-native";

const WEB_URL = /^https?:\/\/[^\s/?#]+/i;
const CONTACT_URL = /^(?:mailto|tel):[^\s]+$/i;

/** True only for an absolute http(s), mailto or tel URL with something after the scheme. */
export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  return WEB_URL.test(url) || CONTACT_URL.test(url);
}

/**
 * Open `url` in the OS if it is safe. Resolves false — and does nothing —
 * for anything else, and false when the OS has no handler for it.
 */
export async function openExternalUrl(url: unknown): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
