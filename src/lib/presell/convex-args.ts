/** Convex schema version whose `createOrder` validator accepts `items[].presellDate`. */
export const CONVEX_PRESELL_MIN_VERSION = 25

/**
 * The `presellDate` field for one Convex order item, or nothing.
 *
 * Convex rejects unknown validator fields, so a pre-v25 deployment sent this
 * would fail the whole checkout. Unknown versions read as "too old" for the
 * same reason. Omission is safe: the date also rides in customerData
 * (`presell_date`), which the merchant app falls back to.
 */
export function convexPresellItemFields(
  presellDate: string | null | undefined,
  convexSchemaVersion: number | null | undefined,
): { presellDate: string } | Record<string, never> {
  if (!presellDate) return {}
  if ((convexSchemaVersion ?? 0) < CONVEX_PRESELL_MIN_VERSION) return {}
  return { presellDate }
}
