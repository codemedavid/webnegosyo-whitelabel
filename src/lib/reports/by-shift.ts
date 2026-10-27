/**
 * Reports "By shift" (CONTRACTS §8): one business day split into the store's
 * named shifts (service periods) and "Other hours".
 *
 * The rows must add up to the day, so the windows TILE the business day:
 * every instant of [day start, day end or now) is in exactly one segment.
 * - A shift is clipped to the day (on a midnight store "Night 8 PM–2 AM" is
 *   counted up to midnight; the rest belongs to the next day).
 * - Where two shifts overlap, the one that started first keeps the overlap.
 * - Time outside every shift becomes "Other hours" (one row however many gaps).
 *
 * Each segment is read with `report_period_sales`, and so is the whole day:
 * the figures come from the ONE sales definition, never added up here from
 * orders. This module only cuts windows and sums what came back, then says
 * whether Σ rows equals the day (it always should, because the SQL windows
 * are half-open and tile).
 */

import { servicePeriodWindow, type ServicePeriodTimes } from '@/lib/business-day/service-periods'
import { tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'
import type { ShiftSalesPayment, ShiftSalesReport } from '@/lib/cash/shift-sales'

export const OTHER_HOURS_KEY = 'other'
export const OTHER_HOURS_LABEL = 'Other hours'

export interface ByShiftPeriod extends ServicePeriodTimes {
  id: string
  name: string
}

export interface ByShiftSegment {
  /** The period id, or OTHER_HOURS_KEY. */
  key: string
  label: string
  /** Half-open [startIso, endIso). */
  startIso: string
  endIso: string
}

interface SegmentInput {
  dayKey: string
  schedule: CutoffSchedule
  /** The periods that apply to the branch being read, in the store's order. */
  periods: readonly ByShiftPeriod[]
  /** A day still running is read up to now; null = the whole day. */
  untilMs: number | null
}

interface Span {
  key: string
  label: string
  startMs: number
  endMs: number
  order: number
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function other(startMs: number, endMs: number): ByShiftSegment {
  return { key: OTHER_HOURS_KEY, label: OTHER_HOURS_LABEL, startIso: iso(startMs), endIso: iso(endMs) }
}

/** The segments that tile the day, in time order. */
export function byShiftSegments({ dayKey, schedule, periods, untilMs }: SegmentInput): ByShiftSegment[] {
  const day = tradingDayWindow(dayKey, schedule)
  const dayStart = Date.parse(day.startIso)
  const dayEnd = untilMs === null ? Date.parse(day.endIso) : Math.min(Date.parse(day.endIso), untilMs)
  if (dayEnd <= dayStart) return []

  const spans: Span[] = periods
    .map((period, order) => {
      const window = servicePeriodWindow(dayKey, period, schedule)
      return {
        key: period.id,
        label: period.name,
        startMs: Math.max(dayStart, Date.parse(window.startIso)),
        endMs: Math.min(dayEnd, Date.parse(window.endIso)),
        order,
      }
    })
    .filter((span) => span.startMs < span.endMs)
    .sort((a, b) => a.startMs - b.startMs || a.order - b.order)

  const segments: ByShiftSegment[] = []
  let cursor = dayStart
  for (const span of spans) {
    const start = Math.max(cursor, span.startMs)
    if (start >= span.endMs) continue // wholly inside an earlier shift
    if (cursor < start) segments.push(other(cursor, start))
    segments.push({ key: span.key, label: span.label, startIso: iso(start), endIso: iso(span.endMs) })
    cursor = span.endMs
  }
  if (cursor < dayEnd) segments.push(other(cursor, dayEnd))
  return segments
}

export interface ByShiftRow {
  key: string
  label: string
  /** The shift's window on this day (clipped); null for "Other hours". */
  startIso: string | null
  endIso: string | null
  netCents: number
  orders: number
  /** Paid by, largest first. */
  payments: ShiftSalesPayment[]
}

export type ByShiftResult =
  | { kind: 'ready'; rows: ByShiftRow[]; totalCents: number; dayNetCents: number; addsUp: boolean }
  | { kind: 'unavailable' }

function mergePayments(lists: ReadonlyArray<readonly ShiftSalesPayment[]>): ShiftSalesPayment[] {
  const byKey = new Map<string, ShiftSalesPayment>()
  for (const payment of lists.flat()) {
    const seen = byKey.get(payment.key)
    byKey.set(payment.key, seen ? { ...seen, cents: seen.cents + payment.cents, count: seen.count + payment.count } : { ...payment })
  }
  return [...byKey.values()].sort((a, b) => b.cents - a.cents)
}

interface RowsInput {
  segments: readonly ByShiftSegment[]
  /** One report per segment, same order. */
  reports: readonly ShiftSalesReport[]
  /** The whole day, read the same way. */
  day: ShiftSalesReport
}

/** One row per named shift, one "Other hours" row (left out when empty), and whether they sum to the day. */
export function buildByShiftRows({ segments, reports, day }: RowsInput): ByShiftResult {
  if (reports.length !== segments.length) throw new Error('One report per segment')
  const isReadable = (report: ShiftSalesReport) => report.source === 'server' && report.summary !== null
  if (!isReadable(day) || !reports.every(isReadable)) return { kind: 'unavailable' }

  const named: ByShiftRow[] = []
  const others: ShiftSalesReport[] = []
  segments.forEach((segment, index) => {
    const report = reports[index]
    if (segment.key === OTHER_HOURS_KEY) {
      others.push(report)
      return
    }
    named.push({
      key: segment.key,
      label: segment.label,
      startIso: segment.startIso,
      endIso: segment.endIso,
      netCents: report.summary?.netCents ?? 0,
      orders: report.summary?.orders ?? 0,
      payments: mergePayments([report.payments ?? []]),
    })
  })

  const otherRow: ByShiftRow = {
    key: OTHER_HOURS_KEY,
    label: OTHER_HOURS_LABEL,
    startIso: null,
    endIso: null,
    netCents: others.reduce((sum, report) => sum + (report.summary?.netCents ?? 0), 0),
    orders: others.reduce((sum, report) => sum + (report.summary?.orders ?? 0), 0),
    payments: mergePayments(others.map((report) => report.payments ?? [])),
  }
  const hasOther = otherRow.orders > 0 || otherRow.netCents !== 0
  const rows = hasOther ? [...named, otherRow] : named
  const totalCents = rows.reduce((sum, row) => sum + row.netCents, 0)
  const dayNetCents = day.summary?.netCents ?? 0
  return { kind: 'ready', rows, totalCents, dayNetCents, addsUp: totalCents === dayNetCents }
}
