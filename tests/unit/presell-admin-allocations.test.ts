/**
 * What the merchant's allocation panel says about a dish's dates: the
 * upcoming/past split, the header totals, each date's status, and the plan
 * for filling a date range with one stock figure.
 */

import {
  splitAllocations,
  summarizeAllocations,
  describeAllocationStatus,
  planRangeAllocation,
} from '@/lib/presell/admin-allocations'

const row = (presell_date: string, stock_qty: number, sold_qty: number) => ({
  id: presell_date, tenant_id: 't', menu_item_id: 'm', presell_date, stock_qty, sold_qty, created_at: '',
})

const ROWS = [
  row('2026-12-25', 10, 10),
  row('2026-12-20', 20, 3),
  row('2026-12-10', 5, 5),
  row('2026-12-24', 8, 6),
]
const TODAY = '2026-12-18'

describe('splitAllocations', () => {
  it('sorts upcoming dates soonest first and past dates most recent first', () => {
    const { upcoming, past } = splitAllocations(ROWS, TODAY)
    expect(upcoming.map((r) => r.presell_date)).toEqual(['2026-12-20', '2026-12-24', '2026-12-25'])
    expect(past.map((r) => r.presell_date)).toEqual(['2026-12-10'])
  })

  it('counts today as upcoming', () => {
    const { upcoming } = splitAllocations([row(TODAY, 1, 0)], TODAY)
    expect(upcoming).toHaveLength(1)
  })
})

describe('summarizeAllocations', () => {
  it('totals only the upcoming dates', () => {
    expect(summarizeAllocations(ROWS, TODAY)).toEqual({
      upcomingDates: 3,
      offered: 38,
      sold: 19,
      remaining: 19,
      soldOutDates: 1,
    })
  })

  it('never lets remaining go negative when stock was lowered below sold', () => {
    expect(summarizeAllocations([row('2026-12-20', 2, 5)], TODAY).remaining).toBe(0)
  })
})

describe('describeAllocationStatus', () => {
  it('is sold out at zero remaining', () => {
    expect(describeAllocationStatus(row('2026-12-25', 10, 10))).toBe('sold-out')
  })
  it('is low when a quarter or less remains', () => {
    expect(describeAllocationStatus(row('2026-12-24', 8, 6))).toBe('low')
  })
  it('is open otherwise', () => {
    expect(describeAllocationStatus(row('2026-12-20', 20, 3))).toBe('open')
  })
  it('treats a zero-stock date as sold out rather than dividing by zero', () => {
    expect(describeAllocationStatus(row('2026-12-20', 0, 0))).toBe('sold-out')
  })
})

describe('planRangeAllocation', () => {
  it('creates missing dates, flags existing ones as overwrites, and skips the past', () => {
    const plan = planRangeAllocation(ROWS, '2026-12-17', '2026-12-21', TODAY)
    expect(plan.toCreate).toEqual(['2026-12-18', '2026-12-19', '2026-12-21'])
    expect(plan.toOverwrite).toEqual(['2026-12-20'])
    expect(plan.skippedPast).toEqual(['2026-12-17'])
  })

  it('is empty for an inverted range', () => {
    expect(planRangeAllocation(ROWS, '2026-12-21', '2026-12-17', TODAY)).toEqual({
      toCreate: [], toOverwrite: [], skippedPast: [],
    })
  })
})
