/**
 * The calendar's skeleton, without a Date object in sight.
 *
 * Presell dates are plain YYYY-MM-DD business days; building the grid from
 * year/month integers keeps the picker free of timezone drift between server
 * render and the customer's phone.
 */

import { buildMonthGrid, shiftMonth, formatMonthTitle, formatPresellDateLabel } from '@/lib/presell/month-grid'

describe('buildMonthGrid', () => {
  it('lays December 2026 out Sunday-first with leading blanks', () => {
    const weeks = buildMonthGrid(2026, 11)
    // 1 Dec 2026 is a Tuesday → two blanks, then the 1st.
    expect(weeks[0].slice(0, 3)).toEqual([null, null, '2026-12-01'])
    expect(weeks[0]).toHaveLength(7)
  })

  it('ends on the last day of the month and pads the final week', () => {
    const weeks = buildMonthGrid(2026, 11)
    const last = weeks[weeks.length - 1]
    expect(last).toContain('2026-12-31')
    expect(last).toHaveLength(7)
    expect(weeks.flat().filter(Boolean)).toHaveLength(31)
  })

  it('handles a leap February', () => {
    expect(buildMonthGrid(2028, 1).flat().filter(Boolean)).toHaveLength(29)
  })
})

describe('shiftMonth', () => {
  it('wraps December forward into the next year', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
  })

  it('wraps January backward into the previous year', () => {
    expect(shiftMonth({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 })
  })
})

describe('labels', () => {
  it('names the month without touching locale APIs', () => {
    expect(formatMonthTitle({ year: 2026, month: 11 })).toBe('December 2026')
  })

  it('formats a presell date for a cart line', () => {
    expect(formatPresellDateLabel('2026-12-24')).toBe('Dec 24, 2026')
  })
})

describe('date range and labels', () => {
  const { listDateKeys, formatPresellWeekday, formatPresellDateLong } = jest.requireActual('@/lib/presell/month-grid')

  it('lists every day of an inclusive range, crossing a month boundary', () => {
    expect(listDateKeys('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ])
  })

  it('returns just the start when the range is a single day', () => {
    expect(listDateKeys('2026-12-24', '2026-12-24')).toEqual(['2026-12-24'])
  })

  it('returns nothing when the end is before the start', () => {
    expect(listDateKeys('2026-12-24', '2026-12-20')).toEqual([])
  })

  it('caps a runaway range at the maximum', () => {
    expect(listDateKeys('2026-01-01', '2027-12-31')).toHaveLength(62)
  })

  it('formats weekday and long labels by hand', () => {
    expect(formatPresellWeekday('2026-12-24')).toBe('Thu')
    expect(formatPresellDateLong('2026-12-24')).toBe('Thu, Dec 24')
  })
})
