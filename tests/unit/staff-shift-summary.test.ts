import {
  formatShiftLength,
  judgeShift,
  shiftDurationMs,
  shiftTurnover,
  summarizeShifts,
} from '@/lib/staff-activity/shift-summary'
import type { StaffShiftRecord } from '@/lib/staff-activity/staff-activity-service'

const OPENED = Date.parse('2026-09-19T01:00:00Z')

function shift(overrides: Partial<StaffShiftRecord> = {}): StaffShiftRecord {
  return {
    id: 's1',
    outletId: null,
    staffUserId: 'ana',
    staffName: 'Ana',
    status: 'closed',
    openingFloat: 500,
    expectedCash: 1500,
    closingCount: 1500,
    note: null,
    openedAt: new Date(OPENED).toISOString(),
    closedAt: new Date(OPENED + 8 * 3_600_000).toISOString(),
    ...overrides,
  }
}

describe('judgeShift', () => {
  test('an open drawer is not yet a verdict', () => {
    expect(judgeShift(shift({ status: 'open', closedAt: null, expectedCash: null, closingCount: null })))
      .toEqual({ kind: 'open', variance: null })
  })

  test('a closed drawer nobody counted reports no variance rather than zero', () => {
    expect(judgeShift(shift({ expectedCash: null, closingCount: null }))).toEqual({
      kind: 'uncounted',
      variance: null,
    })
  })

  test('counted to the peso is balanced', () => {
    expect(judgeShift(shift())).toEqual({ kind: 'balanced', variance: 0 })
  })

  test('counting less than expected is short, by the difference', () => {
    expect(judgeShift(shift({ closingCount: 1450 }))).toEqual({ kind: 'short', variance: -50 })
  })

  test('counting more than expected is over', () => {
    expect(judgeShift(shift({ closingCount: 1520.5 }))).toEqual({ kind: 'over', variance: 20.5 })
  })

  test('centavo drift never accuses a correctly counted drawer', () => {
    expect(judgeShift(shift({ openingFloat: 0.1, expectedCash: 0.3, closingCount: 0.1 + 0.2 })).kind)
      .toBe('balanced')
  })
})

describe('shiftTurnover', () => {
  test('is the cash taken, not the whole drawer — the float goes back', () => {
    expect(shiftTurnover(shift())).toBe(1000)
  })

  test('is unknown until the register says what it expected', () => {
    expect(shiftTurnover(shift({ expectedCash: null }))).toBeNull()
  })

  test('never reads negative when refunds outran takings', () => {
    expect(shiftTurnover(shift({ expectedCash: 400 }))).toBe(0)
  })
})

describe('shiftDurationMs', () => {
  test('a closed shift is measured by its own stamps', () => {
    expect(shiftDurationMs(shift(), OPENED + 99 * 3_600_000)).toBe(8 * 3_600_000)
  })

  test('an open shift is measured up to now', () => {
    const open = shift({ status: 'open', closedAt: null })
    expect(shiftDurationMs(open, OPENED + 2 * 3_600_000)).toBe(2 * 3_600_000)
  })

  test('a clock that disagrees with itself yields no negative hours', () => {
    expect(shiftDurationMs(shift({ status: 'open', closedAt: null }), OPENED - 1000)).toBe(0)
  })
})

describe('formatShiftLength', () => {
  test('reads in hours and minutes', () => {
    expect(formatShiftLength(7 * 3_600_000 + 20 * 60_000)).toBe('7h 20m')
  })

  test('drops the hour when there is none', () => {
    expect(formatShiftLength(45 * 60_000)).toBe('45m')
  })

  test('a just-opened drawer reads as minutes, not as nothing', () => {
    expect(formatShiftLength(0)).toBe('0m')
  })
})

describe('summarizeShifts', () => {
  test('adds up the days worked, the cash handed over and the drift', () => {
    const totals = summarizeShifts(
      [
        shift({ id: 'a', closingCount: 1450 }),
        shift({ id: 'b', closingCount: 1510 }),
        shift({ id: 'c', status: 'open', closedAt: null, expectedCash: null, closingCount: null }),
      ],
      OPENED + 9 * 3_600_000,
    )
    expect(totals.count).toBe(3)
    expect(totals.openCount).toBe(1)
    expect(totals.countedCount).toBe(2)
    expect(totals.workedMs).toBe(8 * 3_600_000 + 8 * 3_600_000 + 9 * 3_600_000)
    expect(totals.turnover).toBe(2000)
    expect(totals.netVariance).toBe(-40)
    expect(totals.shortCount).toBe(1)
    expect(totals.overCount).toBe(1)
  })

  test('reports no variance at all when no drawer was ever counted', () => {
    const totals = summarizeShifts([shift({ expectedCash: null, closingCount: null })], OPENED)
    expect(totals.netVariance).toBeNull()
    expect(totals.countedCount).toBe(0)
  })

  test('an empty history is zero, not a crash', () => {
    expect(summarizeShifts([], OPENED)).toEqual({
      count: 0,
      openCount: 0,
      countedCount: 0,
      workedMs: 0,
      turnover: 0,
      netVariance: null,
      shortCount: 0,
      overCount: 0,
    })
  })
})
