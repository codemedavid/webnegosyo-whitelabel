import { buildMetricTiles } from '@/components/admin/dashboard/dashboard-metrics'
import type { CustomerSummary } from '@/lib/growth/customer-summary'
import type { DashboardOverview, Kpi, KpiKey } from '@/lib/dashboard/overview'

function kpi(key: KpiKey, current: number, previous: number): Kpi {
  return { key, current, previous, change: null, series: [current, null], previousSeries: [previous, 0] }
}

const overview = {
  labels: ['Mon', 'Tue'],
  kpis: {
    sales: kpi('sales', 1000, 800),
    orders: kpi('orders', 10, 8),
    avgOrder: kpi('avgOrder', 100, 100),
    customers: kpi('customers', 4, 3),
  },
} as unknown as DashboardOverview

const period = {
  orders: 10,
  sales: 1000,
  newCustomers: 3,
  returningCustomers: 5,
  returningMembers: 0,
  newCustomerSales: 300,
  returningCustomerSales: 500,
  walkInOrders: 2,
  walkInSales: 200,
}

const customers: CustomerSummary = {
  current: period,
  previous: { ...period, newCustomers: 1, returningCustomers: 5 },
  trend: [
    { label: 'Mon', new: 3, returning: 5 },
    { label: 'Tue', new: null, returning: null },
  ],
  previousTrend: [
    { new: 1, returning: 5 },
    { new: 0, returning: 0 },
  ],
}

describe('buildMetricTiles', () => {
  test('leads with customers, then sales and orders, for a full-access account', () => {
    const tiles = buildMetricTiles({ customers, overview })

    expect(tiles.map((tile) => tile.key)).toEqual(['newCustomers', 'returningCustomers', 'sales', 'orders'])
    expect(tiles[0]).toMatchObject({
      value: 3,
      previous: 1,
      change: { direction: 'up', text: '+2' },
      series: [3, null],
      previousSeries: [1, 0],
    })
    expect(tiles[2]).toMatchObject({ kind: 'money', value: 1000, change: { direction: 'up', text: '+25%' } })
  })

  test('sales-only accounts get sales, orders and average order', () => {
    expect(buildMetricTiles({ customers: null, overview }).map((tile) => tile.key)).toEqual(['sales', 'orders', 'avgOrder'])
  })

  test('customers-only accounts get the two customer tiles', () => {
    expect(buildMetricTiles({ customers, overview: null }).map((tile) => tile.key)).toEqual([
      'newCustomers',
      'returningCustomers',
    ])
  })
})
