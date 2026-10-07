import { buildVisitIndex, classifySale } from '@/lib/growth/classify-sale'
import { buildGrowth } from '@/lib/growth/growth-metrics'
import { DAY_MS, HOUR_MS, resolveDashboardWindow } from '@/lib/dashboard/periods'
import type { CustomerVisit, SaleRecord } from '@/lib/dashboard/sale-record'
import { makeSale } from '../../fixtures/dashboard-sales'

const NOW = Date.parse('2026-10-04T06:30:00Z') // Sunday 2:30 PM Manila
const ANA = '+639170000001'
const BEN = '+639170000002'
const CAT = '+639170000003'

describe('classifySale', () => {
  test('no phone is a guest', () => {
    expect(classifySale({ phone: null, at: NOW }, null, null).bucket).toBe('guest')
  })

  test('first completed visit is new, even with a card', () => {
    expect(classifySale({ phone: ANA, at: NOW }, null, NOW - DAY_MS).bucket).toBe('new')
  })

  test('a repeat visit is a member only when the card predates the sale', () => {
    expect(classifySale({ phone: ANA, at: NOW }, NOW - DAY_MS, NOW - 2 * DAY_MS).bucket).toBe('member')
    expect(classifySale({ phone: ANA, at: NOW }, NOW - DAY_MS, NOW + 1).bucket).toBe('returning')
    expect(classifySale({ phone: ANA, at: NOW }, NOW - DAY_MS, null).bucket).toBe('returning')
  })

  test('a gap over 60 days is a win-back', () => {
    expect(classifySale({ phone: ANA, at: NOW }, NOW - 61 * DAY_MS, null)).toEqual({
      bucket: 'returning',
      wonBack: true,
    })
  })
})

describe('buildVisitIndex', () => {
  test('finds the latest visit strictly before a moment', () => {
    const index = buildVisitIndex([
      { phone: ANA, at: 30 },
      { phone: ANA, at: 10 },
      { phone: ANA, at: 20 },
    ])

    expect(index.previousVisit(ANA, 20)).toBe(10)
    expect(index.previousVisit(ANA, 31)).toBe(30)
    expect(index.previousVisit(ANA, 10)).toBeNull()
    expect(index.previousVisit(BEN, 99)).toBeNull()
  })
})

function visitsFrom(sales: SaleRecord[], prior: CustomerVisit[] = []): CustomerVisit[] {
  return [...prior, ...sales.flatMap((sale) => (sale.phone ? [{ phone: sale.phone, at: sale.at }] : []))]
}

describe('buildGrowth', () => {
  const window = resolveDashboardWindow('7d', NOW)
  const inWindow = (day: number) => window.start + day * DAY_MS + 10 * HOUR_MS

  test('every completed sale lands in exactly one bucket and the buckets add up', () => {
    // Arrange: Ana is a member (card + earlier visit), Ben is new, Cat is a regular.
    const prior: CustomerVisit[] = [
      { phone: ANA, at: window.start - 40 * DAY_MS },
      { phone: CAT, at: window.start - 5 * DAY_MS },
    ]
    const sales = [
      makeSale({ at: inWindow(1), total: 100 }),
      makeSale({ at: inWindow(2), total: 200, phone: ANA }),
      makeSale({ at: inWindow(3), total: 300, phone: BEN }),
      makeSale({ at: inWindow(4), total: 400, phone: CAT }),
      makeSale({ at: inWindow(4), total: 999, phone: CAT, paymentStatus: 'pending' }),
    ]

    // Act
    const growth = buildGrowth({
      sales,
      visits: buildVisitIndex(visitsFrom(sales.filter((sale) => sale.paymentStatus === 'paid'), prior)),
      cardsSince: { [ANA]: window.start - 60 * DAY_MS },
      window,
    })

    // Assert
    const byBucket = Object.fromEntries(growth.mix.map((slice) => [slice.bucket, slice.sales]))
    expect(byBucket).toEqual({ guest: 100, new: 300, returning: 400, member: 200 })
    expect(growth.totalSales).toBe(1000)
    expect(growth.repeatShare.current).toBe(60)
    expect(growth.capture).toMatchObject({ rate: 75, guestOrders: 1, guestSales: 100 })
  })

  test('the driver is the bucket that moved most against the previous window', () => {
    const sales = [
      makeSale({ at: window.previousStart + DAY_MS, total: 500 }),
      makeSale({ at: inWindow(2), total: 100 }),
      makeSale({ at: inWindow(3), total: 800, phone: BEN }),
    ]

    const growth = buildGrowth({ sales, visits: buildVisitIndex(visitsFrom(sales)), cardsSince: {}, window })

    expect(growth.driver).toEqual({
      bucket: 'new',
      label: 'First-timers',
      difference: 800,
      baselineLabel: 'the previous 7 days',
    })
  })

  test('there is no driver when the comparison window has no sales', () => {
    const sales = [makeSale({ at: inWindow(2), total: 900 })]

    const growth = buildGrowth({ sales, visits: buildVisitIndex([]), cardsSince: {}, window })

    expect(growth.driver).toBeNull()
    expect(growth.hasBaseline).toBe(false)
    expect(growth.capture.previousRate).toBeNull()
    expect(growth.repeatShare.previous).toBeNull()
  })

  test('today is compared with a usual same weekday', () => {
    const today = resolveDashboardWindow('today', NOW)
    const sales = [
      makeSale({ at: today.start + HOUR_MS, total: 1000, phone: ANA }),
      ...[1, 2, 3, 4].map((week) => makeSale({ at: today.start - week * 7 * DAY_MS + HOUR_MS, total: 200 })),
    ]

    const growth = buildGrowth({
      sales,
      visits: buildVisitIndex(visitsFrom(sales)),
      cardsSince: {},
      window: today,
    })

    expect(growth.driver?.baselineLabel).toBe('a usual Sunday')
    expect(growth.driver?.bucket).toBe('new')
    expect(growth.driver?.difference).toBe(1000)
  })

  test('path follows first-timers of the last 30 days and actions use visit history', () => {
    const visits: CustomerVisit[] = [
      { phone: ANA, at: NOW - 10 * DAY_MS },
      { phone: ANA, at: NOW - 2 * DAY_MS },
      { phone: BEN, at: NOW - 20 * DAY_MS }, // single visit, 20 days ago → not back
      { phone: CAT, at: NOW - 90 * DAY_MS },
      { phone: CAT, at: NOW - 80 * DAY_MS },
      { phone: CAT, at: NOW - 70 * DAY_MS }, // cadence 10d, silent 70d → lapsed, not slipping
      { phone: '+639170000004', at: NOW - 40 * DAY_MS },
      { phone: '+639170000004', at: NOW - 20 * DAY_MS }, // cadence 20d, silent 20d → fine
      { phone: '+639170000005', at: NOW - 30 * DAY_MS + 1 },
    ]

    const growth = buildGrowth({
      sales: [],
      visits: buildVisitIndex(visits),
      cardsSince: { [ANA]: NOW - 3 * DAY_MS },
      window,
    })

    expect(growth.path).toEqual({ guestOrders: 0, firstTimers: 3, cameBack: 1, members: 1 })
    expect(growth.actions).toEqual({ firstTimersNotBack: 2, slippingAway: 0 })
  })
})
