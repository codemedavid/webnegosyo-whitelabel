/**
 * How branch figures are written on screen.
 *
 * Shared by the index cards, the summary strip and a branch's own page so the
 * same revenue never appears as `₱84,120` in one place and `₱84120.00` in
 * another. Whole pesos throughout: these are comparison figures read at a
 * glance, and centavos on a five-digit number are noise the eye has to skip.
 */

const PESO_FORMAT = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

/** Whole-peso amount, e.g. `₱84,120`. */
export function formatPeso(value: number): string {
  return `₱${PESO_FORMAT.format(Math.round(value))}`
}

/** `1 order` / `4 orders` — the count is usually small enough to read literally. */
export function formatOrderCount(count: number): string {
  return `${count} ${count === 1 ? 'order' : 'orders'}`
}

/** `1 staff` / `2 staff`, or a plain phrase when the branch has nobody. */
export function formatStaffCount(count: number): string {
  return count === 0 ? 'No staff yet' : `${count} staff`
}

/** Share of store takings as a whole percentage, e.g. `46%`. */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`
}
