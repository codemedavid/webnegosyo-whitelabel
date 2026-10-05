import { buildVisitIndex } from '@/lib/growth/classify-sale'
import { buildCustomerSummary } from '@/lib/growth/customer-summary'
import { DAY_MS, HOUR_MS, resolveDashboardWindow } from '@/lib/dashboard/periods'
import type { CustomerVisit, SaleRecord } from '@/lib/dashboard/sale-record'
import { makeSale } from '../../fixtures/dashboard-sales'

const NOW = Date.parse('2026-10-04T06:30:00Z') // Sunday 2:30 PM Manila
const ANA = '+639170000001'
const BEN = '+639170000002'
const CAT = '+639170000003'

const window = resolveDashboardWindow('7d', NOW)
const inWindow = (day: number, hour = 10) => window.start + day * DAY_MS + hour * HOUR_MS
const inPrevious = (day: number) => window.previousStart + day * DAY_MS + 10 * HOUR_MS

function visitsFrom(sales: SaleRecord[], prior: CustomerVisit[] = []): CustomerVisit[] {
  return [...prior, ...sales.flatMap((sale) => (sale.phone ? [{ phone: sale.phone, at: sale.at }] : []))]
}

function summarize(sales: SaleRecord[], prior: CustomerVisit[] = [], cardsSince: Record<string, number> = {}) {
  return buildCustomerSummary({ sales, visits: buildVisitIndex(visitsFrom(sales, prior)), cardsSince, window })
}

describe('buildCustomerSummary', () => {
  test('counts people, not orders: a first-timer who orders twice is one new customer', () => {
    // Arrange: Ben orders twice this week for the first time ever; Ana has been here before.
    const sales = [
      makeSale({ at: inWindow(1), phone: BEN, total: 200 }),
      makeSale({ at: inWindow(4), phone: BEN, total: 300 }),
      makeSale({ at: inWindow(2), phone: ANA, total: 150 }),
    ]
    const prior = [{ phone: ANA, at: window.start - 40 * DAY_MS }]

    // Act
    const { current } = summarize(sales, prior)

    // Assert
    expect(current.newCustomers).toBe(1)
    expect(current.returningCustomers).toBe(1)
    expect(current.newCustomerSales).toBe(500)
    expect(current.returningCustomerSales).toBe(150)
    expect(current.orders).toBe(3)
  })

  test('new + returning + walk-in sales add up to total sales', () => {
    const sales = [
      makeSale({ at: inWindow(0), phone: ANA, total: 120 }),
      makeSale({ at: inWindow(3), phone: CAT, total: 80.5 }),
      makeSale({ at: inWindow(3), phone: null, total: 99.5 }),
      makeSale({ at: inWindow(5), phone: null, total: 50 }),
    ]

    const { current } = summarize(sales, [{ phone: CAT, at: window.start - DAY_MS }])

    expect(current.sales).toBe(350)
    expect(current.newCustomerSales + current.returningCustomerSales + current.walkInSales).toBe(current.sales)
    expect(current.walkInOrders).toBe(2)
  })

  test('ignores cancelled and unpaid sales', () => {
    const sales = [
      makeSale({ at: inWindow(1), phone: ANA, status: 'cancelled' }),
      makeSale({ at: inWindow(1), phone: BEN, paymentStatus: 'unpaid' }),
    ]

    const { current } = summarize(sales)

    expect(current.orders).toBe(0)
    expect(current.newCustomers).toBe(0)
  })

  test('classifies the previous period against its own start', () => {
    // Ana's first ever visit is in the previous window, then she returns this week.
    const sales = [
      makeSale({ at: inPrevious(2), phone: ANA }),
      makeSale({ at: inWindow(2), phone: ANA }),
      makeSale({ at: inPrevious(3), phone: BEN }),
    ]

    const { current, previous } = summarize(sales)

    expect(previous.newCustomers).toBe(2)
    expect(previous.returningCustomers).toBe(0)
    expect(current.newCustomers).toBe(0)
    expect(current.returningCustomers).toBe(1)
  })

  test('counts stamp-card holders among returning customers only', () => {
    // Ana returns with a card; Ben returns with a card issued after the period; Cat is new but already holds a card.
    const sales = [
      makeSale({ at: inWindow(1), phone: ANA }),
      makeSale({ at: inWindow(1), phone: BEN }),
      makeSale({ at: inWindow(1), phone: CAT }),
    ]
    const prior = [
      { phone: ANA, at: window.start - 10 * DAY_MS },
      { phone: BEN, at: window.start - 10 * DAY_MS },
    ]

    const { current } = summarize(sales, prior, {
      [ANA]: window.start - DAY_MS,
      [BEN]: NOW + DAY_MS,
      [CAT]: window.start - DAY_MS,
    })

    expect(current.returningCustomers).toBe(2)
    expect(current.returningMembers).toBe(1)
  })

  test('the day-by-day new counts add up to the headline new-customer count', () => {
    const sales = [
      makeSale({ at: inWindow(0), phone: ANA }),
      makeSale({ at: inWindow(2), phone: ANA }),
      makeSale({ at: inWindow(2), phone: BEN }),
      makeSale({ at: inWindow(2, 12), phone: BEN }),
    ]

    const { current, trend } = summarize(sales)
    const newPerDay = trend.map((row) => row.new ?? 0)

    expect(newPerDay.reduce((a, b) => a + b, 0)).toBe(current.newCustomers)
    expect(trend[0]).toMatchObject({ new: 1, returning: 0 })
    // Day 2: Ana is back (returning); Ben's first day, counted once despite two orders.
    expect(trend[2]).toMatchObject({ new: 1, returning: 1 })
  })

  test('future days in the window are null so the chart does not draw fake zeros', () => {
    const { trend } = summarize([])

    expect(trend).toHaveLength(7)
    expect(trend[6].new).toBe(0) // today has started
    expect(trend.every((row) => row.new !== null)).toBe(true)

    const today = buildCustomerSummary({
      sales: [],
      visits: buildVisitIndex([]),
      cardsSince: {},
      window: resolveDashboardWindow('today', NOW),
    })
    expect(today.trend[23].new).toBeNull()
  })

  test('gives a previous-period series per bucket for the comparison line', () => {
    const sales = [
      makeSale({ at: inPrevious(1), phone: ANA }),
      makeSale({ at: inPrevious(1), phone: BEN }),
      makeSale({ at: inPrevious(3), phone: ANA }),
    ]

    const { previousTrend } = summarize(sales)

    expect(previousTrend).toHaveLength(7)
    expect(previousTrend[1]).toEqual({ new: 2, returning: 0 })
    expect(previousTrend[3]).toEqual({ new: 0, returning: 1 })
    expect(previousTrend[0]).toEqual({ new: 0, returning: 0 })
  })
})
