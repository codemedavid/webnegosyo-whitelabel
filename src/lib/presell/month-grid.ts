/**
 * The presell calendar's skeleton, built from integers.
 *
 * A presell date is a plain YYYY-MM-DD business day. Laying the month out from
 * year/month numbers — and formatting labels by hand — keeps the picker free of
 * timezone and locale drift between the server render and the customer's
 * phone, the same reason `formatPresellDate` in the checkout guard avoids
 * `toLocaleString`.
 */

export interface MonthCursor {
  year: number
  /** 0-based, like `Date#getMonth`. */
  month: number
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

const DAYS_PER_WEEK = 7

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y, month: m - 1, day: d }
}

/**
 * Sunday-first weeks of date keys, `null` for cells outside the month.
 * Uses UTC arithmetic so the weekday of the 1st never depends on the runtime's
 * timezone.
 */
export function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(year, month, day))
  }
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += DAYS_PER_WEEK) {
    weeks.push(cells.slice(i, i + DAYS_PER_WEEK))
  }
  return weeks
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const index = cursor.year * 12 + cursor.month + delta
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

export function monthCursorOf(dateKey: string): MonthCursor {
  const { year, month } = parseDateKey(dateKey)
  return { year, month }
}

export function formatMonthTitle(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month]} ${cursor.year}`
}

/** "Dec 24, 2026" — for cart lines and toasts. */
export function formatPresellDateLabel(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey)
  return `${MONTH_NAMES[month].slice(0, 3)} ${day}, ${year}`
}

/** "Dec 24" — for the calendar cell's accessible name. */
export function formatPresellDayLabel(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey)
  return `${MONTH_NAMES[month].slice(0, 3)} ${day}`
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** The most days one range helper may fill at once — two months, roughly. */
export const MAX_RANGE_DAYS = 62

const MS_PER_DAY = 24 * 60 * 60 * 1000

function utcDayOf(key: string): Date {
  const { year, month, day } = parseDateKey(key)
  return new Date(Date.UTC(year, month, day))
}

/**
 * Every date key from `startKey` through `endKey` inclusive, capped at
 * MAX_RANGE_DAYS. Empty for an inverted range. UTC arithmetic, so a DST
 * change on the merchant's machine can never drop or double a day.
 */
export function listDateKeys(startKey: string, endKey: string): string[] {
  if (endKey < startKey) return []
  const start = utcDayOf(startKey).getTime()
  const end = utcDayOf(endKey).getTime()
  const span = Math.min(Math.round((end - start) / MS_PER_DAY), MAX_RANGE_DAYS - 1)
  return Array.from({ length: span + 1 }, (_, offset) => {
    const d = new Date(start + offset * MS_PER_DAY)
    return toDateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  })
}

/** "Thu" — the weekday a date key falls on. */
export function formatPresellWeekday(dateKey: string): string {
  return WEEKDAY_NAMES[utcDayOf(dateKey).getUTCDay()]
}

/** "Thu, Dec 24" — for the merchant's allocation list. */
export function formatPresellDateLong(dateKey: string): string {
  return `${formatPresellWeekday(dateKey)}, ${formatPresellDayLabel(dateKey)}`
}
