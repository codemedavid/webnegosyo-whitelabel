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
// Single line on purpose: the app's parity guard strips whole `import` lines,
// so a wrapped import would read as drift between two identical files.
import { describeCountSession, type CountSessionProgress } from '@/lib/inventory/count-session'

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
 * A percentage.
 *
 * One decimal place: whole numbers read as rounded guesses, and two decimals
 * imply a precision the underlying costs do not have. `toFixed` is used rather
 * than any locale formatter, for the hydration reason at the top of this file.
 */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`
}

/** The food cost share, rendered the same way as every other percentage. */
export function formatFoodCostPercent(percent: number): string {
  return formatPercent(percent)
}

/**
 * Why there is no food cost percentage, when there isn't one.
 *
 * Two causes that look identical in the data and mean opposite things: a day
 * that genuinely sold nothing, and a day whose sales this report failed to
 * fetch. The first is the merchant's own quiet day; the second is our fault and
 * says nothing about the shop. Collapsing them into one message — or worse,
 * into a "0%" — is exactly the failure this phase exists to avoid.
 *
 * Returns `null` when the day has sales and the percentage speaks for itself.
 */
export function describeRevenueCaveat(revenue: number | null): string | null {
  if (revenue === null) {
    return (
      'Sales for this day could not be read, so the food cost percentage is not shown.' +
      ' The stock figures below are unaffected.'
    )
  }

  if (revenue <= 0) {
    return 'No sales were recorded for this day, so there is nothing to compare the stock cost against.'
  }

  return null
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
 *
 * `countSession` is optional and omitting it is the correct call for every day
 * before count sessions existed, and for every tenant who counts without opening
 * one. Inventing an "abandoned count" caveat from an absent session would accuse
 * a merchant of a count they never started.
 */
export function describeReportCaveats(
  report: DailyInventoryReport,
  countSession?: CountSessionProgress | null,
): string[] {
  const caveats: string[] = []

  // First, because it is the REASON the ingredients below went unexplained. A
  // merchant who reads the consequence first has already started blaming the
  // shelf by the time they learn nobody finished counting it.
  //
  // This cannot be folded into `uncountedCount`: that figure only covers
  // ingredients that MOVED today, so a count which skipped the entire dry store
  // would otherwise leave the report with nothing to say.
  const sessionCaveat = countSession ? describeCountSession(countSession) : null
  if (sessionCaveat) caveats.push(sessionCaveat)

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
