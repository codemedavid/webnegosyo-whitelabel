/**
 * "Back" after a cross-link inside the merchant tabs.
 *
 * The tab navigator keeps React Navigation's default `firstRoute` back
 * behaviour, so `router.back()` on a screen pushed onto a tab goes HOME. A
 * cross-link that must come back (the Drawer's Reprint → the order; the order's
 * "Printer settings" → the order) passes `returnTo`, and that screen's Back
 * navigates there. Global back behaviour is deliberately left alone.
 *
 * Pure, so the node Jest project can test it; the hook lives in
 * hooks/use-return-to.ts.
 */
import { goTo } from "./tab-navigation";

/** Only paths inside the merchant tabs; a longer one is not ours. */
const TAB_PREFIX = "/(main)/";
const MAX_RETURN_TO_LENGTH = 512;

/** The router calls `leaveTo` drives. */
export interface ReturnRouter {
  back: () => void;
  navigate: (href: string) => void;
  replace: (href: string) => void;
}

/** A `returnTo` search param, or null when it is missing or not a tab path. */
export function parseReturnTo(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  if (!value.startsWith(TAB_PREFIX) || value.length > MAX_RETURN_TO_LENGTH) return null;
  const path = value.slice(TAB_PREFIX.length);
  if (path.length === 0 || path.startsWith("/") || path.includes("//") || path.includes("\\")) return null;
  return value;
}

/** `href` with `returnTo` added as one encoded query value. */
export function withReturnTo(href: string, returnTo: string | null): string {
  if (!returnTo) return href;
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}returnTo=${encodeURIComponent(returnTo)}`;
}

/** Leave the screen: to `returnTo` when there is one, else an ordinary back. */
export function leaveTo(router: ReturnRouter, returnTo: string | null): void {
  if (returnTo) {
    goTo(router, returnTo);
    return;
  }
  router.back();
}
