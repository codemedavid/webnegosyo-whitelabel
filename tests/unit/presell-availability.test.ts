/**
 * Pure presell arithmetic: what each date has left, what a stepper may reach,
 * and the one-date-per-cart rule.
 *
 * The deliberate inversion vs. ingredient inventory: there, untracked means
 * UNLIMITED (a dish with no recipe behaves as before inventory existed). A
 * presell item with no allocation on a date means ZERO — the whole point of
 * presell is that only allocated dates are sellable.
 */

import {
  resolvePresellRemaining,
  buildPresellCalendar,
  resolvePresellAddable,
  describePresellRemaining,
  findCartPresellDate,
  collectPresellLines,
} from '@/lib/presell/availability'

const ROWS = [
  { menu_item_id: 'm-bilao', presell_date: '2026-12-24', stock_qty: 20, sold_qty: 5 },
  { menu_item_id: 'm-bilao', presell_date: '2026-12-25', stock_qty: 30, sold_qty: 30 },
  { menu_item_id: 'm-bilao', presell_date: '2026-12-20', stock_qty: 10, sold_qty: 0 },
]

describe('resolvePresellRemaining', () => {
  it('is stock minus sold', () => {
    expect(resolvePresellRemaining(20, 5)).toBe(15)
  })

  it('clamps to zero when the merchant lowered stock below what already sold', () => {
    expect(resolvePresellRemaining(3, 5)).toBe(0)
  })
})

describe('buildPresellCalendar', () => {
  it('maps each future date to its remaining count', () => {
    const calendar = buildPresellCalendar(ROWS, '2026-12-01')
    expect(calendar.get('2026-12-24')).toBe(15)
    expect(calendar.get('2026-12-20')).toBe(10)
  })

  it('keeps sold-out dates at zero so the calendar can say so', () => {
    const calendar = buildPresellCalendar(ROWS, '2026-12-01')
    expect(calendar.get('2026-12-25')).toBe(0)
  })

  it('drops dates before today — a past presell date is not an offer', () => {
    const calendar = buildPresellCalendar(ROWS, '2026-12-21')
    expect(calendar.has('2026-12-20')).toBe(false)
    expect(calendar.has('2026-12-24')).toBe(true)
  })

  it('keeps today itself', () => {
    const calendar = buildPresellCalendar(ROWS, '2026-12-20')
    expect(calendar.get('2026-12-20')).toBe(10)
  })
})

describe('resolvePresellAddable', () => {
  it('is the remaining allocation minus what the cart already holds', () => {
    expect(resolvePresellAddable(15, 3, 99)).toBe(12)
  })

  it('treats no allocation as zero, not unlimited', () => {
    expect(resolvePresellAddable(null, 0, 99)).toBe(0)
  })

  it('never goes negative when stock fell after the cart was built', () => {
    expect(resolvePresellAddable(2, 5, 99)).toBe(0)
  })

  it('still respects the hard per-line cap', () => {
    expect(resolvePresellAddable(500, 0, 99)).toBe(99)
  })
})

describe('describePresellRemaining', () => {
  it('says sold out when the date has nothing left', () => {
    expect(describePresellRemaining(0, 0)).toBe('Sold out for this date')
  })

  it('tells the customer when their cart holds the whole allocation', () => {
    expect(describePresellRemaining(5, 5)).toBe('That’s all available for this date')
  })

  it('counts down when the remainder is small', () => {
    expect(describePresellRemaining(5, 2)).toBe('Only 3 left for this date')
  })

  it('stays quiet when plenty remains', () => {
    expect(describePresellRemaining(80, 0)).toBeNull()
  })

  it('has no opinion without a selected date', () => {
    expect(describePresellRemaining(null, 0)).toBeNull()
  })
})

describe('findCartPresellDate', () => {
  it('returns the one date the cart holds', () => {
    const items = [{ presell_date: '2026-12-24' }, {}]
    expect(findCartPresellDate(items)).toBe('2026-12-24')
  })

  it('returns null for a cart with no presell lines', () => {
    expect(findCartPresellDate([{}, {}])).toBeNull()
  })
})

describe('collectPresellLines', () => {
  it('aggregates quantities per item and date, ignoring non-presell lines', () => {
    const items = [
      { menu_item: { id: 'm-bilao' }, quantity: 2, presell_date: '2026-12-24' },
      { menu_item: { id: 'm-bilao' }, quantity: 3, presell_date: '2026-12-24' },
      { menu_item: { id: 'm-cake' }, quantity: 1, presell_date: '2026-12-24' },
      { menu_item: { id: 'm-coke' }, quantity: 4 },
    ]
    expect(collectPresellLines(items)).toEqual([
      { menuItemId: 'm-bilao', presellDate: '2026-12-24', quantity: 5 },
      { menuItemId: 'm-cake', presellDate: '2026-12-24', quantity: 1 },
    ])
  })

  it('returns an empty list for a cart with no presell lines', () => {
    expect(collectPresellLines([{ menu_item: { id: 'm-coke' }, quantity: 4 }])).toEqual([])
  })
})
