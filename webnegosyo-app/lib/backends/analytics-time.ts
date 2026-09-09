/**
 * Local-day helpers for analytics bucketing.
 *
 * Mirrors `convex-template/convex/time.ts` so a platform-backend store buckets
 * its days exactly as its Convex neighbour does: on the merchant's local
 * (Asia/Manila, fixed UTC+8) calendar day, never the UTC one — otherwise the
 * first eight hours of trading land on the previous date.
 */

import { DEFAULT_TZ_OFFSET_MS } from "./supabase-orders";

export { localDayStartMs, DEFAULT_TZ_OFFSET_MS } from "./supabase-orders";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-day date key "YYYY-MM-DD" for an epoch ms instant. */
export function localDateKey(atMs: number, offsetMs: number = DEFAULT_TZ_OFFSET_MS): string {
  return new Date(atMs + offsetMs).toISOString().split("T")[0];
}

/** Local day-of-week (0=Sun..6=Sat) for an epoch ms instant. */
export function localDayOfWeek(atMs: number, offsetMs: number = DEFAULT_TZ_OFFSET_MS): number {
  return new Date(atMs + offsetMs).getUTCDay();
}

/** Local hour (0..23) for an epoch ms instant. */
export function localHour(atMs: number, offsetMs: number = DEFAULT_TZ_OFFSET_MS): number {
  return new Date(atMs + offsetMs).getUTCHours();
}
