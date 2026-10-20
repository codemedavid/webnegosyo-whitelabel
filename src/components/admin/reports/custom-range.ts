/**
 * Client-side check for a custom report range (plan §3.3). The server
 * re-validates; this only gives the owner an inline reason before navigating.
 * Plain YYYY-MM-DD strings, compared as UTC calendar days (no time zones).
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function dayNumber(value: string): number | null {
  if (!ISO_DAY.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return time / DAY_MS
}

export interface CustomRangeInput {
  from: string
  to: string
  today: string
  maxDays: number
}

/** `null` when the range is fine, else one sentence saying what to fix. */
export function customRangeError({ from, to, today, maxDays }: CustomRangeInput): string | null {
  if (!from || !to) return 'Pick a start and an end date.'
  const start = dayNumber(from)
  const end = dayNumber(to)
  const now = dayNumber(today)
  if (start === null || end === null) return 'Enter dates as year-month-day.'
  if (start > end) return 'The start date must be on or before the end date.'
  if (now !== null && end > now) return "The end date can't be after today."
  const days = end - start + 1
  if (days > maxDays) return `Pick ${maxDays} days or fewer (this range is ${days}).`
  return null
}
