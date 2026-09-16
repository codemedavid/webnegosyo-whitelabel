/**
 * Human-friendly order number formatting (ported from web `src/lib/order-number.ts`).
 *
 * Orders carry a per-tenant, daily-resetting sequence number (`daily_number`)
 * assigned at creation time. It is a display value only — never the primary key.
 * Orders created before this feature shipped have no daily number, so callers
 * pass the order UUID as a fallback to keep a stable identifier on screen.
 */

/** Minimum digit width for the daily number (e.g. 1 -> "01"). */
const MIN_DIGITS = 2

/** Characters of the order UUID used for the fallback display slice. */
const FALLBACK_SLICE_LENGTH = 8

/**
 * Format an order's display number.
 *
 * @param dailyNumber Per-tenant daily sequence number (1-based). Ignored when
 *   null/undefined or not a positive integer.
 * @param fallbackId Order UUID used when no daily number is available.
 * @returns `#07`, `#123`, `#12AB34CD` (fallback), or `''` when nothing is known.
 */
export function formatDailyOrderNumber(
  dailyNumber?: number | null,
  fallbackId?: string
): string {
  if (typeof dailyNumber === 'number' && Number.isInteger(dailyNumber) && dailyNumber > 0) {
    return `#${String(dailyNumber).padStart(MIN_DIGITS, '0')}`
  }

  if (fallbackId) {
    return `#${fallbackId.slice(0, FALLBACK_SLICE_LENGTH).toUpperCase()}`
  }

  return ''
}
