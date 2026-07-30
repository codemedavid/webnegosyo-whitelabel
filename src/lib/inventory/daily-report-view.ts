/**
 * Presenting the daily report: money, quantities, dates, and caveats.
 *
 * Pure and separate from the component, like `stock-alerts-view.ts`. The
 * merchant app will render this same report later, and two surfaces describing
 * the same day differently is a worse bug than either one being slightly plain.
 *
 * NOTHING HERE MAY USE `toLocaleString`. A locale-formatted number or date
 * renders differently on the server than in the browser and trips hydration —
 * a bug this codebase has already shipped twice. The grouping and the month
 * names below are done by hand for exactly that reason.
 */

import type { DailyInventoryReport } from '@/lib/inventory/daily-report'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** Digits kept when rendering a quantity, matching the NUMERIC(16,4) column. */
const QUANTITY_PRECISION = 4

/** Inserts a comma every three digits, left of the decimal point. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Money, always with centavos.
 *
 * A total shown as "₱1,234" reads as rounded and invites doubt; "₱1,234.50"
 * reads as counted. The sign leads the symbol so a negative is unmistakable
 * rather than hidden mid-string.
 */
export function formatPeso(amount: number): string {
  const isNegative = amount < 0
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.')

  return `${isNegative ? '-' : ''}₱${groupThousands(whole)}.${fraction}`
}

/**
 * A quantity with its unit.
 *
 * "200" alone is unreadable — 200 grams and 200 kilos are different problems.
 * Trailing zeros from a NUMERIC(16,4) round-trip are trimmed so a whole number
 * reads as one.
 */
export function formatQuantity(quantity: number, unitAbbreviation: string): string {
  const trimmed = Number(quantity.toFixed(QUANTITY_PRECISION)).toString()

  return unitAbbreviation ? `${trimmed} ${unitAbbreviation}` : trimmed
}

/**
 * The day, named.
 *
 * The weekday is included because a merchant reasons in "last Saturday", not in
 * calendar dates — and because a weekend figure means something different from
 * a Tuesday one.
 *
 * The key is already a Manila date, so it is read as a plain calendar date with
 * no further timezone shift.
 */
export function formatBusinessDayLabel(dayKey: string): string {
  const instant = Date.parse(`${dayKey}T00:00:00.000Z`)
  if (Number.isNaN(instant)) {
    throw new Error(`Expected a YYYY-MM-DD business day, received "${dayKey}"`)
  }

  const date = new Date(instant)
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${WEEKDAYS[date.getUTCDay()]}, ${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * What this report cannot tell you.
 *
 * This is the whole failure mode of the feature. Zero shrinkage because nobody
 * counted reads exactly like zero shrinkage because nothing was lost, and a low
 * COGS because an ingredient has no price reads exactly like a cheap day. Both
 * have to be said out loud, in the merchant's own terms, or the report is
 * quietly reassuring rather than useful.
 *
 * Returns an empty list when everything was counted and priced — a caveat that
 * is always present is a caveat nobody reads.
 */
export function describeReportCaveats(report: DailyInventoryReport): string[] {
  const caveats: string[] = []

  if (report.uncountedCount === 1) {
    caveats.push('1 ingredient moved today but was never counted, so its shrinkage is unknown.')
  } else if (report.uncountedCount > 1) {
    caveats.push(
      `${report.uncountedCount} ingredients moved today but were never counted,` +
        ' so their shrinkage is unknown.',
    )
  }

  if (report.uncostedCount === 1) {
    caveats.push('1 ingredient has no cost set, so its money is missing from these totals.')
  } else if (report.uncostedCount > 1) {
    caveats.push(
      `${report.uncostedCount} ingredients have no cost set,` +
        ' so their money is missing from these totals.',
    )
  }

  return caveats
}
