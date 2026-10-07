import { buildOverview, percentChange, rankTopItems } from '@/lib/dashboard/overview'
import { HOUR_MS, resolveDashboardWindow } from '@/lib/dashboard/periods'
import { isCompletedSale, toSaleChannel } from '@/lib/dashboard/sale-record'
import { makeSale } from '../../fixtures/dashboard-sales'

const NOW = Date.parse('2026-10-04T06:30:00Z') // 2:30 PM Manila
const window = resolveDashboardWindow('today', NOW)
const at = (hour: number) => window.start + hour * HOUR_MS + 60_000
const yesterdayAt = (hour: number) => window.previousStart + hour * HOUR_MS + 60_000

describe('completed-sale rule', () => {
  test('counter sales count once paid, online orders once delivered', () => {
    expect(isCompletedSale(makeSale({ at: 0, channel: 'counter', paymentStatus: 'paid' }))).toBe(true)
    expect(isCompletedSale(makeSale({ at: 0, channel: 'counter', paymentStatus: 'pending' }))).toBe(false)
    expect(isCompletedSale(makeSale({ at: 0, channel: 'online', status: 'delivered', paymentStatus: 'pending' }))).toBe(true)
    expect(isCompletedSale(makeSale({ at: 0, channel: 'online', status: 'ready' }))).toBe(false)
    expect(isCompletedSale(makeSale({ at: 0, status: 'cancelled', paymentStatus: 'paid' }))).toBe(false)
  })

  test('maps order sources onto channels', () => {
    expect(toSaleChannel('pos')).toBe('counter')
    expect(toSaleChannel('qr_handoff')).toBe('qr')
    expect(toSaleChannel('mobile')).toBe('app')
    expect(toSaleChannel('web')).toBe('online')
    expect(toSaleChannel(null)).toBe('online')
  })
})

describe('buildOverview', () => {
  test('totals, deltas and series count only completed sales in each window', () => {
    // Arrange
    const sales = [
      makeSale({ at: at(9), total: 200, phone: '+639170000001' }),
      makeSale({ at: at(9), total: 100 }),
      makeSale({ at: at(13), total: 300, phone: '+639170000001' }),
      makeSale({ at: at(10), total: 999, status: 'cancelled' }),
      makeSale({ at: yesterdayAt(9), total: 300 }),
      makeSale({ at: yesterdayAt(20), total: 500 }), // after the comparison cut-off
    ]

    // Act
    const overview = buildOverview(sales, window)

    // Assert
    expect(overview.kpis.sales.current).toBe(600)
    expect(overview.kpis.sales.previous).toBe(300)
    expect(overview.kpis.sales.change).toBe(100)
    expect(overview.kpis.orders.current).toBe(3)
    expect(overview.kpis.avgOrder.current).toBe(200)
    expect(overview.kpis.customers.current).toBe(1)
    expect(overview.kpis.sales.series[9]).toBe(300)
    expect(overview.kpis.sales.series[14]).toBe(0)
    expect(overview.kpis.sales.series[15]).toBeNull() // future hour
    expect(overview.busiestHour?.hour).toBe(9)
  })

  test('names no busiest hour when the top hours are tied', () => {
    // Arrange — one order each at 9 AM, 1 PM and 6 PM
    const sales = [makeSale({ at: at(9) }), makeSale({ at: at(13) }), makeSale({ at: at(18) })]

    // Act
    const overview = buildOverview(sales, window)

    // Assert
    expect(overview.busiestHour).toBeNull()
  })

  test('breaks sales down by channel with shares', () => {
    const overview = buildOverview(
      [
        makeSale({ at: at(8), total: 300, channel: 'counter' }),
        makeSale({ at: at(8), total: 100, channel: 'online', status: 'delivered' }),
      ],
      window,
    )

    expect(overview.channels.map((row) => [row.key, row.share])).toEqual([
      ['counter', 75],
      ['online', 25],
    ])
  })

  test('percent change is null without a baseline', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(50, 200)).toBe(-75)
  })
})

describe('rankTopItems', () => {
  test('ranks by revenue, merging by menu item id', () => {
    const ranked = rankTopItems([
      makeSale({ at: 0, items: [{ menuItemId: 'a', name: 'Latte', quantity: 2, revenue: 300 }] }),
      makeSale({ at: 0, items: [{ menuItemId: 'a', name: 'Latte', quantity: 1, revenue: 150 }] }),
      makeSale({ at: 0, items: [{ menuItemId: null, name: 'Ube Cake', quantity: 5, revenue: 400 }] }),
    ])

    expect(ranked?.map((item) => [item.name, item.quantity, item.revenue])).toEqual([
      ['Latte', 3, 450],
      ['Ube Cake', 5, 400],
    ])
  })

  test('is null when no sale carried line items', () => {
    expect(rankTopItems([makeSale({ at: 0, items: null })])).toBeNull()
  })
})
