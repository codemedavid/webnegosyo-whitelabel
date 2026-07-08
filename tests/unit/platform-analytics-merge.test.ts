import {
  rangeToWindows,
  convexResponsesToAggregate,
  rowsToTenantAggregates,
  buildPlatformAnalytics,
  emptyAggregate,
  type OrderRow,
  type ConvexResponses,
  type TenantWindowAggregate,
  type TenantMeta,
} from '@/lib/queries/platform-analytics-merge'

const DAY = 86400000
// Fixed "now": 2026-07-08T12:00:00Z (Manila +8 → 2026-07-08 20:00 local)
const NOW = Date.parse('2026-07-08T12:00:00Z')

describe('rangeToWindows', () => {
  it('maps 7d to a current and previous 7-day window', () => {
    const w = rangeToWindows('7d', NOW)
    expect(w.days).toBe(7)
    expect(w.endMs).toBe(NOW)
    expect(w.startMs).toBe(NOW - 7 * DAY)
    expect(w.prevStartMs).toBe(NOW - 14 * DAY)
    expect(w.prevEndMs).toBe(NOW - 7 * DAY)
  })

  it('maps 30d and 90d correctly', () => {
    expect(rangeToWindows('30d', NOW).startMs).toBe(NOW - 30 * DAY)
    expect(rangeToWindows('90d', NOW).startMs).toBe(NOW - 90 * DAY)
    expect(rangeToWindows('90d', NOW).prevStartMs).toBe(NOW - 180 * DAY)
  })

  it('maps all to an open-ended window with no previous window', () => {
    const w = rangeToWindows('all', NOW)
    expect(w.days).toBeNull()
    expect(w.startMs).toBeNull()
    expect(w.prevStartMs).toBeNull()
    expect(w.prevEndMs).toBeNull()
    expect(w.endMs).toBe(NOW)
  })
})

describe('emptyAggregate', () => {
  it('produces an all-zero aggregate for a tenant', () => {
    const a = emptyAggregate('t1')
    expect(a.tenantId).toBe('t1')
    expect(a.orders).toBe(0)
    expect(a.gmv).toBe(0)
    expect(a.daily).toEqual({})
    expect(a.statusCounts).toEqual({})
  })
})

describe('convexResponsesToAggregate', () => {
  const responses: ConvexResponses = {
    current: {
      totalOrders: 10, // non-cancelled count
      totalRevenue: 2500,
      avgOrderValue: 250,
      statusCounts: { pending: 1, confirmed: 2, preparing: 0, ready: 0, delivered: 7, cancelled: 3 },
    },
    prev: {
      totalOrders: 5,
      totalRevenue: 1000,
      avgOrderValue: 200,
      statusCounts: { pending: 0, confirmed: 0, preparing: 0, ready: 0, delivered: 5, cancelled: 1 },
    },
    trends: [
      { date: '2026-07-07', totalOrders: 4, totalRevenue: 1000, avgOrderValue: 250 },
      { date: '2026-07-08', totalOrders: 6, totalRevenue: 1500, avgOrderValue: 250 },
    ],
    breakdown: {
      byOrderType: [
        { type: 'Dine In', revenue: 1500, count: 6 },
        { type: 'delivery', revenue: 1000, count: 4 },
      ],
      byPaymentMethod: [
        { method: 'GCash', revenue: 2000, count: 8 },
        { method: 'cod', revenue: 500, count: 2 },
      ],
    },
  }

  it('maps current totals to orders and gmv (non-cancelled semantics)', () => {
    const a = convexResponsesToAggregate('t1', responses)
    expect(a.tenantId).toBe('t1')
    expect(a.orders).toBe(10)
    expect(a.gmv).toBe(2500)
  })

  it('derives completed and cancelled from status counts', () => {
    const a = convexResponsesToAggregate('t1', responses)
    expect(a.completed).toBe(7)
    expect(a.cancelled).toBe(3)
    expect(a.statusCounts.cancelled).toBe(3)
  })

  it('maps previous-window stats for deltas', () => {
    const a = convexResponsesToAggregate('t1', responses)
    expect(a.prevOrders).toBe(5)
    expect(a.prevGmv).toBe(1000)
  })

  it('builds daily buckets keyed by trend date', () => {
    const a = convexResponsesToAggregate('t1', responses)
    expect(a.daily['2026-07-08']).toEqual({ orders: 6, revenue: 1500 })
    expect(a.daily['2026-07-07']).toEqual({ orders: 4, revenue: 1000 })
  })

  it('normalizes order-type and payment breakdown labels', () => {
    const a = convexResponsesToAggregate('t1', responses)
    // 'delivery' -> 'Delivery', 'cod' -> 'Cash on Delivery'
    expect(a.orderType['Delivery']).toEqual({ count: 4, revenue: 1000 })
    expect(a.orderType['Dine In']).toEqual({ count: 6, revenue: 1500 })
    expect(a.payment['Cash on Delivery']).toEqual({ count: 2, revenue: 500 })
    expect(a.payment['GCash']).toEqual({ count: 8, revenue: 2000 })
  })

  it('handles a null previous window and null breakdown', () => {
    const a = convexResponsesToAggregate('t1', { ...responses, prev: null, breakdown: null })
    expect(a.prevOrders).toBeNull()
    expect(a.prevGmv).toBeNull()
    expect(a.orderType).toEqual({})
    expect(a.payment).toEqual({})
  })
})

describe('rowsToTenantAggregates', () => {
  const windows = rangeToWindows('7d', NOW)
  const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

  const rows: OrderRow[] = [
    // tenant A — current window, non-cancelled
    { tenant_id: 'A', created_at: iso(1 * DAY), total: 300, status: 'delivered', order_type: 'Dine In', payment_method_name: 'GCash' },
    { tenant_id: 'A', created_at: iso(2 * DAY), total: 200, status: 'pending', order_type: 'pickup', payment_method_name: 'Cash' },
    // tenant A — current window, cancelled (excluded from gmv/orders but counted in statusCounts)
    { tenant_id: 'A', created_at: iso(1 * DAY), total: 999, status: 'cancelled', order_type: 'Dine In', payment_method_name: 'GCash' },
    // tenant A — previous window
    { tenant_id: 'A', created_at: iso(9 * DAY), total: 100, status: 'delivered', order_type: 'Dine In', payment_method_name: 'GCash' },
    // tenant B — current window
    { tenant_id: 'B', created_at: iso(3 * DAY), total: 500, status: 'ready', order_type: 'Delivery', payment_method_name: 'Maya' },
    // Convex-backed tenant C — must be excluded entirely
    { tenant_id: 'C', created_at: iso(1 * DAY), total: 12345, status: 'delivered', order_type: 'Dine In', payment_method_name: 'GCash' },
  ]

  it('excludes Convex-backed tenants from the Supabase aggregate', () => {
    const aggs = rowsToTenantAggregates(rows, windows, new Set(['C']))
    expect(aggs.find((a) => a.tenantId === 'C')).toBeUndefined()
  })

  it('sums non-cancelled orders and gmv for the current window', () => {
    const aggs = rowsToTenantAggregates(rows, windows, new Set(['C']))
    const a = aggs.find((x) => x.tenantId === 'A')!
    expect(a.orders).toBe(2) // cancelled excluded
    expect(a.gmv).toBe(500) // 300 + 200, cancelled 999 excluded
  })

  it('counts cancelled and completed via status counts', () => {
    const aggs = rowsToTenantAggregates(rows, windows, new Set(['C']))
    const a = aggs.find((x) => x.tenantId === 'A')!
    expect(a.cancelled).toBe(1)
    expect(a.completed).toBe(1) // one delivered in current window
    expect(a.statusCounts.cancelled).toBe(1)
    expect(a.statusCounts.delivered).toBe(1)
    expect(a.statusCounts.pending).toBe(1)
  })

  it('computes previous-window totals for deltas', () => {
    const aggs = rowsToTenantAggregates(rows, windows, new Set(['C']))
    const a = aggs.find((x) => x.tenantId === 'A')!
    expect(a.prevOrders).toBe(1)
    expect(a.prevGmv).toBe(100)
  })

  it('normalizes breakdown labels and excludes cancelled from them', () => {
    const aggs = rowsToTenantAggregates(rows, windows, new Set(['C']))
    const a = aggs.find((x) => x.tenantId === 'A')!
    expect(a.orderType['Dine In']).toEqual({ count: 1, revenue: 300 }) // cancelled Dine In excluded
    expect(a.orderType['Pick Up']).toEqual({ count: 1, revenue: 200 })
    expect(a.payment['GCash']).toEqual({ count: 1, revenue: 300 })
  })
})

describe('buildPlatformAnalytics', () => {
  const meta: Record<string, TenantMeta> = {
    A: { name: 'Alpha Cafe', slug: 'alpha', isActive: true },
    B: { name: 'Bravo Bites', slug: 'bravo', isActive: true },
  }

  const aggA: TenantWindowAggregate = {
    tenantId: 'A',
    orders: 10,
    gmv: 3000,
    completed: 7,
    cancelled: 2,
    prevOrders: 5,
    prevGmv: 1500,
    daily: { '2026-07-07': { orders: 4, revenue: 1000 }, '2026-07-08': { orders: 6, revenue: 2000 } },
    statusCounts: { pending: 1, delivered: 7, cancelled: 2 },
    orderType: { 'Dine In': { count: 6, revenue: 2000 }, Delivery: { count: 4, revenue: 1000 } },
    payment: { GCash: { count: 8, revenue: 2500 }, Cash: { count: 2, revenue: 500 } },
  }
  const aggB: TenantWindowAggregate = {
    tenantId: 'B',
    orders: 20,
    gmv: 4000,
    completed: 18,
    cancelled: 1,
    prevOrders: 10,
    prevGmv: 2000,
    daily: { '2026-07-08': { orders: 20, revenue: 4000 } },
    statusCounts: { delivered: 18, ready: 1, cancelled: 1 },
    orderType: { Delivery: { count: 20, revenue: 4000 } },
    payment: { GCash: { count: 20, revenue: 4000 } },
  }

  it('sums KPIs across all tenant aggregates', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    expect(r.kpis.gmv).toBe(7000)
    expect(r.kpis.orders).toBe(30)
    expect(r.kpis.aov).toBeCloseTo(7000 / 30)
    expect(r.kpis.completed).toBe(25)
    expect(r.kpis.cancelled).toBe(3)
  })

  it('computes cancel rate over cancelled + non-cancelled orders', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    // 3 cancelled / (30 non-cancelled + 3 cancelled) = 3/33
    expect(r.kpis.cancelRate).toBeCloseTo(3 / 33)
  })

  it('computes gmv and orders deltas vs the previous window', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    // gmv 7000 vs prev 3500 → +100%
    expect(r.kpis.gmvDelta).toBeCloseTo(100)
    // orders 30 vs prev 15 → +100%
    expect(r.kpis.ordersDelta).toBeCloseTo(100)
  })

  it('returns null deltas for the all range', () => {
    const r = buildPlatformAnalytics('all', [aggA, aggB], meta)
    expect(r.kpis.gmvDelta).toBeNull()
    expect(r.kpis.ordersDelta).toBeNull()
  })

  it('merges daily time series for short ranges', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    const jul8 = r.timeSeries.find((b) => b.date === '2026-07-08')!
    expect(jul8.orders).toBe(26) // 6 + 20
    expect(jul8.revenue).toBe(6000) // 2000 + 4000
    const jul7 = r.timeSeries.find((b) => b.date === '2026-07-07')!
    expect(jul7.orders).toBe(4)
    // sorted ascending by date
    expect(r.timeSeries.map((b) => b.date)).toEqual(['2026-07-07', '2026-07-08'])
  })

  it('rolls daily buckets up to months for 90d/all', () => {
    const r = buildPlatformAnalytics('all', [aggA, aggB], meta)
    expect(r.timeSeries).toHaveLength(1)
    expect(r.timeSeries[0].date).toBe('2026-07-01')
    expect(r.timeSeries[0].orders).toBe(30)
    expect(r.timeSeries[0].revenue).toBe(7000)
  })

  it('orders the status breakdown by the fulfillment funnel', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    const labels = r.statusBreakdown.map((s) => s.label)
    expect(labels.indexOf('pending')).toBeLessThan(labels.indexOf('delivered'))
    expect(labels.indexOf('delivered')).toBeLessThan(labels.indexOf('cancelled'))
    const delivered = r.statusBreakdown.find((s) => s.label === 'delivered')!
    expect(delivered.count).toBe(25)
  })

  it('merges and sorts order-type and payment breakdowns by count', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    const delivery = r.orderTypeBreakdown.find((s) => s.label === 'Delivery')!
    expect(delivery.count).toBe(24) // 4 + 20
    expect(delivery.revenue).toBe(5000)
    // sorted by count desc → Delivery(24) before Dine In(6)
    expect(r.orderTypeBreakdown[0].label).toBe('Delivery')
    const gcash = r.paymentBreakdown.find((s) => s.label === 'GCash')!
    expect(gcash.count).toBe(28)
  })

  it('ranks the leaderboard by order activity and attaches tenant metadata', () => {
    const r = buildPlatformAnalytics('7d', [aggA, aggB], meta)
    // B has more orders (20) than A (10) → B first
    expect(r.topByRevenue[0].tenantId).toBe('B')
    expect(r.topByRevenue[0].name).toBe('Bravo Bites')
    expect(r.topByRevenue[0].orders).toBe(20)
    expect(r.topByRevenue[0].gmv).toBe(4000)
    expect(r.topByRevenue[1].tenantId).toBe('A')
  })

  it('limits the leaderboard to the top 8 tenants', () => {
    const many: TenantWindowAggregate[] = Array.from({ length: 12 }, (_, i) => ({
      ...emptyAggregate(`t${i}`),
      orders: i + 1,
      gmv: (i + 1) * 100,
    }))
    const r = buildPlatformAnalytics('7d', many, {})
    expect(r.topByRevenue).toHaveLength(8)
    expect(r.topByRevenue[0].orders).toBe(12) // highest activity first
  })

  it('handles an empty set of aggregates without throwing', () => {
    const r = buildPlatformAnalytics('7d', [], {})
    expect(r.kpis.gmv).toBe(0)
    expect(r.kpis.orders).toBe(0)
    expect(r.kpis.aov).toBe(0)
    expect(r.kpis.cancelRate).toBe(0)
    expect(r.timeSeries).toEqual([])
    expect(r.topByRevenue).toEqual([])
  })
})
