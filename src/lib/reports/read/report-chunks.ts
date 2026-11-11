/**
 * Long report windows → calls the platform report functions accept.
 *
 * Each report function covers at most `SQL_REPORT_MAX_DAYS` (93) days. A
 * longer window ("This year", "Last 12 months") is read as one call per
 * business MONTH and the rows are merged (`merge-report-rows.ts`). Every order
 * belongs to exactly one chunk (half-open windows), so sums and order counts
 * add up exactly; ratios are recomputed from the merged parts.
 *
 * Month boundaries (not "every 90 days") keep a finished month's chunk the
 * same from one request to the next, so it can be cached (`isClosed`).
 *
 * Pure: `now` is passed in.
 */

import { MIDNIGHT_SCHEDULE, tradingDayOf, tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { SQL_REPORT_MAX_DAYS } from '../period'

const DAY_MS = 24 * 60 * 60 * 1000
const SQL_MAX_SPAN_MS = SQL_REPORT_MAX_DAYS * DAY_MS

export interface ReportChunk {
  /** Half-open [start, end), epoch ms. */
  start: number
  end: number
  /** Ended before today's business day began: its figures only change if an old order is edited. */
  isClosed: boolean
}

export interface ChunkOptions {
  now: number
  schedule?: CutoffSchedule
}

function dayStart(dayKey: string, schedule: CutoffSchedule): number {
  return Date.parse(tradingDayWindow(dayKey, schedule).startIso)
}

function nextMonthFirst(dayKey: string): string {
  const year = Number(dayKey.slice(0, 4))
  const month = Number(dayKey.slice(5, 7))
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

/** True when one report function call can read the whole window. */
export function fitsOneReportCall(start: number, end: number): boolean {
  return end - start <= SQL_MAX_SPAN_MS
}

/**
 * The window as-is when one call covers it; otherwise split at the start of
 * each business month inside it. An empty window yields no chunks.
 */
export function splitReportWindow(start: number, end: number, { now, schedule = MIDNIGHT_SCHEDULE }: ChunkOptions): ReportChunk[] {
  if (end <= start) return []
  const todayStart = dayStart(tradingDayOf(new Date(now).toISOString(), schedule), schedule)
  if (fitsOneReportCall(start, end)) return [{ start, end, isClosed: end <= todayStart }]

  const chunks: ReportChunk[] = []
  let chunkStart = start
  let monthKey = nextMonthFirst(tradingDayOf(new Date(start).toISOString(), schedule))
  while (chunkStart < end) {
    const boundary = Math.min(dayStart(monthKey, schedule), end)
    if (boundary > chunkStart) {
      chunks.push({ start: chunkStart, end: boundary, isClosed: boundary <= todayStart })
      chunkStart = boundary
    }
    monthKey = nextMonthFirst(monthKey)
  }
  return chunks
}
