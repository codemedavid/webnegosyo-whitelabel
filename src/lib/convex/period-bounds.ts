/**
 * Half-open windows against Convex's inclusive period query.
 *
 * `orders:getDashboardStatsByPeriod` filters `>= startDate AND <= endDate`
 * (the merchant app relies on that contract, so the deployed function is not
 * changed). Our windows are half-open `[start, end)`. `_creationTime` carries
 * fractions of a millisecond, so `end − 1` lost any order in (end − 1, end):
 * counted on neither day. The largest double below `end` makes `<=` exactly
 * `<`.
 */

/** The `endDate` to send for a half-open window ending at `endMs`. */
export function inclusiveEndFor(endMs: number): number {
  if (!Number.isFinite(endMs)) throw new Error(`Expected a finite window end, received ${endMs}`)
  if (endMs === 0) return -Number.MIN_VALUE

  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, endMs)
  const bits = view.getBigUint64(0)
  // For a positive double the next one down has bits − 1; for a negative one, bits + 1.
  view.setBigUint64(0, endMs > 0 ? bits - BigInt(1) : bits + BigInt(1))
  return view.getFloat64(0)
}
