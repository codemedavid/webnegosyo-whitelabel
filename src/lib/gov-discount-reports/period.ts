/**
 * The days a Senior/PWD report covers, in Manila time.
 *
 * Whole calendar days, never a rolling window: the sales book is kept per
 * day and per month, and an accountant asks for "October", not "the last 30
 * days". The Philippines has no daylight saving, so Manila is always UTC+8.
 *
 * The window is half-open: `startIso` ≤ occurred_at < `endIso`.
 */

export const REPORT_PERIODS = ['today', 'week', 'month', 'last_month', 'custom'] as const
export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]

export const REPORT_PERIOD_LABELS: Readonly<Record<ReportPeriodKey, string>> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  last_month: 'Last month',
  custom: 'Custom',
}

export const DEFAULT_REPORT_PERIOD: ReportPeriodKey = 'month'

/** A custom range longer than this is shortened to its last year. */
export const MAX_CUSTOM_DAYS = 366

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export interface ReportPeriod {
  key: ReportPeriodKey
  /** First Manila day covered, `YYYY-MM-DD`. */
  fromDay: string
  /** Last Manila day covered (inclusive), `YYYY-MM-DD`. */
  toDay: string
  startIso: string
  endIso: string
  /** "October 2026", "Oct 1 – 12, 2026", "Today". */
  label: string
  /** For file names: `2026-10` for a whole month, else `2026-10-01_to_2026-10-12`. */
  fileTag: string
}

export interface ReportPeriodQuery {
  period?: string | null
  from?: string | null
  to?: string | null
}

interface DayParts {
  year: number
  month: number // 1-12
  day: number
}

/** The Manila calendar day an instant falls on, `YYYY-MM-DD`. */
export function manilaDayKey(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function partsOf(dayKey: string): DayParts | null {
  const match = DAY_KEY.exec(dayKey)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(year, month - 1, day))
  const isRealDate =
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  return isRealDate ? { year, month, day } : null
}

/** Midnight in Manila at the start of a day, as epoch ms. */
function dayStartMs({ year, month, day }: DayParts): number {
  return Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && partsOf(value) !== null
}

function window(key: ReportPeriodKey, startMs: number, endMs: number, label: string, isWholeMonth: boolean): ReportPeriod {
  const fromDay = manilaDayKey(startMs)
  const toDay = manilaDayKey(endMs - 1)
  return {
    key,
    fromDay,
    toDay,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    label,
    fileTag: isWholeMonth ? fromDay.slice(0, 7) : fromDay === toDay ? fromDay : `${fromDay}_to_${toDay}`,
  }
}

function monthWindow(key: ReportPeriodKey, year: number, month: number): ReportPeriod {
  const startMs = Date.UTC(year, month - 1, 1) - MANILA_OFFSET_MS
  const endMs = Date.UTC(year, month, 1) - MANILA_OFFSET_MS
  const normalised = new Date(Date.UTC(year, month - 1, 1))
  const label = `${MONTH_NAMES[normalised.getUTCMonth()]} ${normalised.getUTCFullYear()}`
  return window(key, startMs, endMs, label, true)
}

function shortDay(parts: DayParts): string {
  return `${MONTH_NAMES[parts.month - 1].slice(0, 3)} ${parts.day}`
}

/** "Oct 1 – 12, 2026", "Sep 28 – Oct 4, 2026", "Dec 29, 2025 – Jan 4, 2026". */
export function rangeLabel(fromDay: string, toDay: string): string {
  const from = partsOf(fromDay)
  const to = partsOf(toDay)
  if (!from || !to) return `${fromDay} – ${toDay}`
  if (fromDay === toDay) return `${shortDay(from)}, ${from.year}`
  if (from.year !== to.year) return `${shortDay(from)}, ${from.year} – ${shortDay(to)}, ${to.year}`
  const end = from.month === to.month ? String(to.day) : shortDay(to)
  return `${shortDay(from)} – ${end}, ${to.year}`
}

function customWindow(fromRaw: string, toRaw: string): ReportPeriod {
  const [earlier, later] = fromRaw <= toRaw ? [fromRaw, toRaw] : [toRaw, fromRaw]
  const endMs = dayStartMs(partsOf(later) as DayParts) + DAY_MS
  const requestedStart = dayStartMs(partsOf(earlier) as DayParts)
  const startMs = Math.max(requestedStart, endMs - MAX_CUSTOM_DAYS * DAY_MS)
  const fromDay = manilaDayKey(startMs)
  const fromParts = partsOf(fromDay) as DayParts
  const toParts = partsOf(later) as DayParts
  const lastOfMonth = new Date(Date.UTC(toParts.year, toParts.month, 0)).getUTCDate()
  const isWholeMonth =
    fromParts.day === 1 &&
    fromParts.year === toParts.year &&
    fromParts.month === toParts.month &&
    toParts.day === lastOfMonth
  return window('custom', startMs, endMs, rangeLabel(fromDay, later), isWholeMonth)
}

export function parseReportPeriodKey(value: string | null | undefined): ReportPeriodKey {
  return (REPORT_PERIODS as readonly string[]).includes(value ?? '')
    ? (value as ReportPeriodKey)
    : DEFAULT_REPORT_PERIOD
}

/**
 * The window a query string asks for. Anything unreadable falls back to this
 * month, so a hand-edited link never opens on an empty, unexplained page.
 */
export function resolveReportPeriod(query: ReportPeriodQuery, nowMs: number): ReportPeriod {
  const key = parseReportPeriodKey(query.period)
  const today = partsOf(manilaDayKey(nowMs)) as DayParts
  const todayStart = dayStartMs(today)

  switch (key) {
    case 'today':
      return window('today', todayStart, todayStart + DAY_MS, 'Today', false)
    case 'week': {
      const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
      const daysSinceMonday = (weekday + 6) % 7
      const startMs = todayStart - daysSinceMonday * DAY_MS
      const label = `This week · ${rangeLabel(manilaDayKey(startMs), manilaDayKey(startMs + 6 * DAY_MS))}`
      return window('week', startMs, startMs + 7 * DAY_MS, label, false)
    }
    case 'last_month':
      return monthWindow('last_month', today.year, today.month - 1)
    case 'custom':
      if (isDayKey(query.from) && isDayKey(query.to)) return customWindow(query.from, query.to)
      return monthWindow('month', today.year, today.month)
    case 'month':
    default:
      return monthWindow('month', today.year, today.month)
  }
}

/** The query string that reopens a period (for links and exports). */
export function periodSearchParams(period: ReportPeriod): Record<string, string> {
  return period.key === 'custom'
    ? { period: 'custom', from: period.fromDay, to: period.toDay }
    : { period: period.key }
}
