/**
 * Phase 1c — the wording of the daily report.
 *
 * Kept pure and out of the component for two reasons. The merchant app will
 * render the same report later and the two surfaces must not describe the same
 * day differently; and every string here is a claim about money, so it needs to
 * be assertable without mounting anything.
 *
 * Nothing in this module may use `toLocaleString`. A locale-formatted number or
 * date renders differently on the server and the client and trips hydration —
 * a bug this codebase has already shipped twice.
 */

import {
  formatPeso,
  formatQuantity,
  formatBusinessDayLabel,
  describeReportCaveats,
} from '@/lib/inventory/daily-report-view'
import type { DailyInventoryReport } from '@/lib/inventory/daily-report'

function report(overrides: Partial<DailyInventoryReport> = {}): DailyInventoryReport {
  return {
    rows: [],
    totals: { cogs: 0, wasteCost: 0, shrinkageCost: 0 },
    countedCount: 0,
    uncountedCount: 0,
    uncostedCount: 0,
    ...overrides,
  }
}

describe('formatPeso', () => {
  test('always shows centavos, so a total never looks rounded off', () => {
    expect(formatPeso(1234.5)).toBe('₱1,234.50')
  })

  test('groups thousands without a locale', () => {
    // `toLocaleString` would give a different string on the server than in the
    // browser and trip hydration. The grouping is done by hand for that reason.
    expect(formatPeso(1234567.89)).toBe('₱1,234,567.89')
  })

  test('renders nothing spent as zero, not as an empty cell', () => {
    // An empty cell reads as "not measured"; ₱0.00 reads as "measured, none".
    expect(formatPeso(0)).toBe('₱0.00')
  })

  test('keeps a negative readable rather than mangling the sign', () => {
    expect(formatPeso(-42.5)).toBe('-₱42.50')
  })
})

describe('formatQuantity', () => {
  test('carries the unit, because a bare number is unreadable', () => {
    expect(formatQuantity(200, 'g')).toBe('200 g')
  })

  test('trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind', () => {
    expect(formatQuantity(2.5, 'kg')).toBe('2.5 kg')
    expect(formatQuantity(3, 'kg')).toBe('3 kg')
  })

  test('omits the unit for a countable ingredient that has none', () => {
    expect(formatQuantity(12, '')).toBe('12')
  })
})

describe('formatBusinessDayLabel', () => {
  test('names the day so a merchant can tell which service this was', () => {
    // The weekday matters: a merchant reasons in "last Saturday", not in dates.
    expect(formatBusinessDayLabel('2026-07-29')).toBe('Wed, 29 Jul 2026')
  })

  test('is stable across a month boundary', () => {
    expect(formatBusinessDayLabel('2026-08-01')).toBe('Sat, 01 Aug 2026')
  })

  test('rejects a key that is not a calendar date instead of rendering garbage', () => {
    expect(() => formatBusinessDayLabel('not-a-date')).toThrow()
  })
})

describe('describeReportCaveats', () => {
  test('says so when nothing was counted, so a clean report is never mistaken for a checked one', () => {
    // This is the whole failure mode of the feature: zero shrinkage because
    // nobody looked reads exactly like zero shrinkage because nothing was lost.
    const caveats = describeReportCaveats(report({ uncountedCount: 4 }))

    expect(caveats).toContain(
      '4 ingredients moved today but were never counted, so their shrinkage is unknown.',
    )
  })

  test('says so when an ingredient carries no cost, so a low COGS is never read as a cheap day', () => {
    const caveats = describeReportCaveats(report({ uncostedCount: 2 }))

    expect(caveats).toContain(
      '2 ingredients have no cost set, so their money is missing from these totals.',
    )
  })

  test('speaks of one ingredient in the singular', () => {
    const caveats = describeReportCaveats(report({ uncountedCount: 1, uncostedCount: 1 }))

    expect(caveats).toContain(
      '1 ingredient moved today but was never counted, so its shrinkage is unknown.',
    )
    expect(caveats).toContain(
      '1 ingredient has no cost set, so its money is missing from these totals.',
    )
  })

  test('raises both caveats at once when both apply', () => {
    const caveats = describeReportCaveats(report({ uncountedCount: 3, uncostedCount: 2 }))

    expect(caveats).toHaveLength(2)
  })

  test('stays silent when everything was counted and priced', () => {
    // A caveat that is always present is a caveat nobody reads.
    expect(describeReportCaveats(report({ countedCount: 5 }))).toEqual([])
  })
})
