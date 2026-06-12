// Day-boundary helpers for analytics/trends.
//
// The Convex runtime always executes in UTC, but merchants operate in their
// local timezone (default: Philippines / Asia/Manila, UTC+8, no DST). Any
// "per-day" bucketing, date key, or "today" boundary MUST use the merchant's
// local day — otherwise revenue is attributed to the wrong calendar date and
// "today" is shifted by the offset (~8h for PH), so the first hours of the
// local day get dropped or double-counted.
//
// offsetMs is parameterised so a per-tenant timezone (e.g. from tenantConfig)
// can be threaded through later; for now every caller uses the PH default.

/** Default UTC offset: Philippines (Asia/Manila) is a fixed UTC+8. */
export const DEFAULT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms of 00:00 local time for the local day containing `atMs`. */
export function localDayStartMs(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  const dayStartShifted = Math.floor((atMs + offsetMs) / DAY_MS) * DAY_MS;
  return dayStartShifted - offsetMs;
}

/** Local-day date key "YYYY-MM-DD" for an epoch ms instant. */
export function localDateKey(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  return new Date(atMs + offsetMs).toISOString().split("T")[0];
}

/** Local day-of-week (0=Sun..6=Sat) for an epoch ms instant. */
export function localDayOfWeek(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return new Date(atMs + offsetMs).getUTCDay();
}

/** Local hour (0..23) for an epoch ms instant. */
export function localHour(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): number {
  return new Date(atMs + offsetMs).getUTCHours();
}
