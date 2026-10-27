/**
 * Reports "By shift" (CONTRACTS §8): one business day split into the store's
 * named shifts (service periods) plus "Other hours", so the rows ALWAYS add up
 * to the day. The windows tile the day exactly (no gap, no overlap), each is
 * read with `report_period_sales`, and the day itself is read the same way.
 */

import { MIDNIGHT_SCHEDULE, tradingDayWindow, type CutoffSchedule } from '@/lib/business-day/trading-day'
import { buildByShiftRows, byShiftSegments, OTHER_HOURS_KEY, type ByShiftSegment } from '@/lib/reports/by-shift'
import type { ShiftSalesReport } from '@/lib/cash/shift-sales'

const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]
const DAY = '2026-10-24'

const DAY_SHIFT = { id: 'day', name: 'Day shift', startsMinutes: 720, endsMinutes: 1200, outletId: null }
const NIGHT_SHIFT = { id: 'night', name: 'Night shift', startsMinutes: 1200, endsMinutes: 120, outletId: null }

function ms(iso: string): number {
  return Date.parse(iso)
}

function expectTiles(segments: readonly ByShiftSegment[], startIso: string, endIso: string): void {
  expect(segments[0].startIso).toBe(startIso)
  expect(segments[segments.length - 1].endIso).toBe(endIso)
  for (let index = 1; index < segments.length; index += 1) {
    expect(segments[index].startIso).toBe(segments[index - 1].endIso)
  }
  for (const segment of segments) expect(ms(segment.startIso)).toBeLessThan(ms(segment.endIso))
}

describe('byShiftSegments', () => {
  it('splits a 4 AM day into Other · Day shift · Night shift · Other, tiling the day', () => {
    const day = tradingDayWindow(DAY, FOUR_AM)

    const segments = byShiftSegments({ dayKey: DAY, schedule: FOUR_AM, periods: [NIGHT_SHIFT, DAY_SHIFT], untilMs: null })

    expect(segments.map((segment) => segment.key)).toEqual([OTHER_HOURS_KEY, 'day', 'night', OTHER_HOURS_KEY])
    expectTiles(segments, day.startIso, day.endIso)
    // Night shift 8 PM–2 AM stays one shift: Fri 8 PM to Sat 2 AM Manila.
    expect(segments[2]).toMatchObject({ startIso: '2026-10-24T12:00:00.000Z', endIso: '2026-10-24T18:00:00.000Z' })
  })

  it('cuts a period at the end of a midnight day rather than letting it run into the next day', () => {
    const day = tradingDayWindow(DAY, MIDNIGHT_SCHEDULE)

    const segments = byShiftSegments({ dayKey: DAY, schedule: MIDNIGHT_SCHEDULE, periods: [DAY_SHIFT, NIGHT_SHIFT], untilMs: null })

    expectTiles(segments, day.startIso, day.endIso)
    expect(segments[segments.length - 1]).toMatchObject({ key: 'night', endIso: day.endIso })
  })

  it('gives an overlap to the shift that started first, so nothing is counted twice', () => {
    const early = { id: 'early', name: 'Early', startsMinutes: 600, endsMinutes: 900, outletId: null }
    const late = { id: 'late', name: 'Late', startsMinutes: 840, endsMinutes: 1080, outletId: null }
    const day = tradingDayWindow(DAY, FOUR_AM)

    const segments = byShiftSegments({ dayKey: DAY, schedule: FOUR_AM, periods: [late, early], untilMs: null })

    expectTiles(segments, day.startIso, day.endIso)
    const lateSegment = segments.find((segment) => segment.key === 'late')
    // Late starts where Early ends (3 PM Manila), not at 2 PM.
    expect(lateSegment?.startIso).toBe('2026-10-24T07:00:00.000Z')
  })

  it('stops at "now" on a day still running, and drops shifts that have not started', () => {
    const untilMs = ms('2026-10-24T05:00:00.000Z') // 1 PM Manila
    const day = tradingDayWindow(DAY, FOUR_AM)

    const segments = byShiftSegments({ dayKey: DAY, schedule: FOUR_AM, periods: [DAY_SHIFT, NIGHT_SHIFT], untilMs })

    expect(segments.map((segment) => segment.key)).toEqual([OTHER_HOURS_KEY, 'day'])
    expectTiles(segments, day.startIso, '2026-10-24T05:00:00.000Z')
  })

  it('is the whole day as "Other hours" when the store has no named shifts', () => {
    const day = tradingDayWindow(DAY, FOUR_AM)

    expect(byShiftSegments({ dayKey: DAY, schedule: FOUR_AM, periods: [], untilMs: null })).toEqual([
      { key: OTHER_HOURS_KEY, label: 'Other hours', startIso: day.startIso, endIso: day.endIso },
    ])
  })

  it('tiles the day for any set of periods (sweep over every hour pair)', () => {
    const day = tradingDayWindow(DAY, FOUR_AM)
    for (let start = 0; start < 1440; start += 180) {
      for (let end = 0; end < 1440; end += 210) {
        const periods = [
          { id: 'a', name: 'A', startsMinutes: start, endsMinutes: end, outletId: null },
          { id: 'b', name: 'B', startsMinutes: (start + 300) % 1440, endsMinutes: (end + 90) % 1440, outletId: null },
        ]
        expectTiles(byShiftSegments({ dayKey: DAY, schedule: FOUR_AM, periods, untilMs: null }), day.startIso, day.endIso)
      }
    }
  })
})

function report(netCents: number, orders: number, payments: Array<{ key: string; label: string; cents: number; count: number }>): ShiftSalesReport {
  return {
    source: 'server',
    hidden: false,
    window: null,
    shift: null,
    summary: {
      orders,
      grossCents: netCents,
      discountCents: 0,
      netCents,
      serviceChargeCents: 0,
      deliveryCents: 0,
      collectedCents: payments.reduce((sum, payment) => sum + payment.cents, 0),
      unpaidCents: 0,
      overpaidCents: 0,
      voidCount: 0,
      voidCents: 0,
      refundCents: 0,
    },
    payments,
    orderTypes: [],
    channels: [],
    items: [],
    receipts: [],
    receiptsTruncated: false,
    firstNumber: null,
    lastNumber: null,
  }
}

describe('buildByShiftRows', () => {
  const segments: ByShiftSegment[] = [
    { key: OTHER_HOURS_KEY, label: 'Other hours', startIso: 'a', endIso: 'b' },
    { key: 'day', label: 'Day shift', startIso: 'b', endIso: 'c' },
    { key: 'night', label: 'Night shift', startIso: 'c', endIso: 'd' },
    { key: OTHER_HOURS_KEY, label: 'Other hours', startIso: 'd', endIso: 'e' },
  ]

  it('one row per shift and ONE "Other hours" row, and the rows sum to the day', () => {
    const cash = (cents: number) => ({ key: 'id:cash', label: 'Cash', cents, count: 1 })
    const gcash = (cents: number) => ({ key: 'name:gcash', label: 'GCash', cents, count: 1 })

    const result = buildByShiftRows({
      segments,
      reports: [report(1000, 1, [cash(1000)]), report(50000, 10, [cash(30000), gcash(20000)]), report(40000, 8, [gcash(40000)]), report(500, 1, [cash(500)])],
      day: report(91500, 20, []),
    })

    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.rows.map((row) => [row.key, row.netCents, row.orders])).toEqual([
      ['day', 50000, 10],
      ['night', 40000, 8],
      [OTHER_HOURS_KEY, 1500, 2],
    ])
    expect(result.rows[2].payments).toEqual([{ key: 'id:cash', label: 'Cash', cents: 1500, count: 2 }])
    expect(result.totalCents).toBe(91500)
    expect(result.addsUp).toBe(true)
  })

  it('leaves out an empty "Other hours" row but keeps empty named shifts', () => {
    const result = buildByShiftRows({
      segments: segments.slice(1, 3),
      reports: [report(0, 0, []), report(40000, 8, [])],
      day: report(40000, 8, []),
    })

    expect(result.kind === 'ready' && result.rows.map((row) => row.key)).toEqual(['day', 'night'])
  })

  it('says it does not add up (never hides it) when the day disagrees', () => {
    const result = buildByShiftRows({ segments: segments.slice(1, 2), reports: [report(100, 1, [])], day: report(200, 2, []) })

    expect(result.kind === 'ready' && result.addsUp).toBe(false)
  })

  it('is "unavailable" when the store’s orders are not in the platform database', () => {
    const unavailable = { ...report(0, 0, []), source: 'unavailable' as const, summary: null, payments: null }

    expect(buildByShiftRows({ segments: segments.slice(1, 2), reports: [unavailable], day: unavailable }).kind).toBe('unavailable')
  })
})
