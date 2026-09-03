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
