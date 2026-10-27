/**
 * Asia/Manila business dates for the expenses engine.
 *
 * The same rule as `src/lib/inventory/business-day.ts` (a FIXED +08:00 offset:
 * the Philippines has no daylight saving, and the database files
 * `spent_on` by `(created_at at time zone 'Asia/Manila')::date`). It is
 * restated here, import-free, because this file is copied byte-for-byte into
 * the merchant app (`webnegosyo-app/lib/expenses/`), which has no copy of the
 * inventory module. `tests/unit/expenses/manila-date.test.ts` pins that the two
 * agree.
 *
 * Dates are `YYYY-MM-DD` strings, the shape Postgres renders a `date` as.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function instantOf(iso: string): number {
  const instant = Date.parse(iso)
  if (Number.isNaN(instant)) throw new Error(`Expected an ISO timestamp, received "${iso}"`)
  return instant
}

function epochOfDate(dateKey: string): number {
  const epoch = Date.parse(`${dateKey}T00:00:00.000Z`)
  const isReal = DATE_KEY.test(dateKey) && !Number.isNaN(epoch) && new Date(epoch).toISOString().slice(0, 10) === dateKey
  if (!isReal) throw new Error(`Expected a YYYY-MM-DD date, received "${dateKey}"`)
  return epoch
}

/** The Manila calendar date of an instant. */
export function manilaDateOf(iso: string): string {
  return new Date(instantOf(iso) + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

/** Today's date in Manila. `now` is passed in so callers stay pure. */
export function todayInManila(now: Date): string {
  return manilaDateOf(now.toISOString())
}

/** The Manila wall-clock hour (0–23) of an instant. */
export function manilaHourOf(iso: string): number {
  return new Date(instantOf(iso) + MANILA_OFFSET_MS).getUTCHours()
}

/** `dateKey` moved by `days` calendar days (negative = back). */
export function addDays(dateKey: string, days: number): string {
  return new Date(epochOfDate(dateKey) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((epochOfDate(to) - epochOfDate(from)) / DAY_MS)
}
