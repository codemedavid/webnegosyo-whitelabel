/**
 * Reporting windows for the admin dashboard, on the merchant's calendar.
 *
 * Every store trades in the Philippines, which has no daylight saving, so the
 * merchant-local day is a fixed +08:00 offset. Each window is compared with the
 * window of the same length immediately before it, cut at the same clock time:
 * "today so far" is compared with "yesterday up to now", never with all of
 * yesterday.
 */

export type DashboardRange = 'today' | '7d' | '30d' | '90d'

export interface DashboardRangeOption {
  value: DashboardRange
  label: string
  compareLabel: string
  /** Mid-sentence period, e.g. "in the last 7 days". */
  periodPhrase: string
  /** Mid-sentence comparison, e.g. "the previous 7 days". */
  comparePhrase: string
}

export const DASHBOARD_RANGES: ReadonlyArray<DashboardRangeOption> = [
  { value: 'today', label: 'Today', compareLabel: 'yesterday', periodPhrase: 'today', comparePhrase: 'yesterday by this time' },
  { value: '7d', label: '7 days', compareLabel: 'previous 7 days', periodPhrase: 'in the last 7 days', comparePhrase: 'the previous 7 days' },
  { value: '30d', label: '30 days', compareLabel: 'previous 30 days', periodPhrase: 'in the last 30 days', comparePhrase: 'the previous 30 days' },
  { value: '90d', label: '90 days', compareLabel: 'previous 90 days', periodPhrase: 'in the last 90 days', comparePhrase: 'the previous 90 days' },
]

/** A week smooths out one quiet day; the live-orders strip already covers today. */
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = '7d'

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
const MANILA_OFFSET_MS = 8 * HOUR_MS
const RANGE_DAYS: Readonly<Record<Exclude<DashboardRange, 'today'>, number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export interface DashboardWindow {
  range: DashboardRange
  /** Half-open [start, end). */
  start: number
  end: number
  previousStart: number
  previousEnd: number
  bucket: 'hour' | 'day'
  bucketCount: number
  bucketMs: number
}

export function parseDashboardRange(raw: string | string[] | undefined): DashboardRange {
  const value = Array.isArray(raw) ? raw[0] : raw
  return DASHBOARD_RANGES.some((option) => option.value === value)
    ? (value as DashboardRange)
    : DEFAULT_DASHBOARD_RANGE
}

export function rangeOption(range: DashboardRange): DashboardRangeOption {
  return DASHBOARD_RANGES.find((option) => option.value === range) ?? DASHBOARD_RANGES[0]
}

export function compareLabelFor(range: DashboardRange): string {
  return rangeOption(range).compareLabel
}

/** Midnight (merchant-local) of the day containing `ms`, as epoch ms. */
export function manilaDayStart(ms: number): number {
  return Math.floor((ms + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS
}

/** Merchant-local hour of day, 0–23. */
export function manilaHour(ms: number): number {
  return Math.floor((ms - manilaDayStart(ms)) / HOUR_MS)
}

export function resolveDashboardWindow(range: DashboardRange, now: number): DashboardWindow {
  const todayStart = manilaDayStart(now)
  if (range === 'today') {
    return {
      range,
      start: todayStart,
      end: now,
      previousStart: todayStart - DAY_MS,
      previousEnd: now - DAY_MS,
      bucket: 'hour',
      bucketCount: 24,
      bucketMs: HOUR_MS,
    }
  }
  const days = RANGE_DAYS[range]
  const start = todayStart - (days - 1) * DAY_MS
  const span = days * DAY_MS
  return {
    range,
    start,
    end: now,
    previousStart: start - span,
    previousEnd: now - span,
    bucket: 'day',
    bucketCount: days,
    bucketMs: DAY_MS,
  }
}

export function isInCurrent(window: DashboardWindow, at: number): boolean {
  return at >= window.start && at < window.end
}

export function isInPrevious(window: DashboardWindow, at: number): boolean {
  return at >= window.previousStart && at < window.previousEnd
}

/** Bucket index of `at` measured from `origin` (the window or previous-window start). */
export function bucketIndex(window: DashboardWindow, origin: number, at: number): number | null {
  const index = Math.floor((at - origin) / window.bucketMs)
  return index >= 0 && index < window.bucketCount ? index : null
}

/** How many buckets of the current window have started — later ones are the future. */
export function elapsedBuckets(window: DashboardWindow): number {
  return Math.min(window.bucketCount, Math.floor((window.end - 1 - window.start) / window.bucketMs) + 1)
}

export function formatHourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display} ${suffix}`
}

const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })

export function bucketLabels(window: DashboardWindow): string[] {
  return Array.from({ length: window.bucketCount }, (_, i) =>
    window.bucket === 'hour'
      ? formatHourLabel(i)
      : DAY_LABEL.format(new Date(window.start + i * window.bucketMs)),
  )
}
