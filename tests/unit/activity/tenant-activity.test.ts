import {
  CONVEX_SCAN_LIMIT,
  buildActivityRows,
  convexToStats,
  platformRowsToStats,
  summarizeActivity,
  type ActivityTenant,
  type ConvexActivityEntry,
} from '@/lib/activity/tenant-activity'

const tenant = (overrides: Partial<ActivityTenant> = {}): ActivityTenant => ({
  tenantId: 't1',
  name: 'Alpha Cafe',
  slug: 'alpha',
  isActive: true,
  backend: 'platform',
  ...overrides,
})

describe('platformRowsToStats', () => {
  it('reads the aggregate, coercing Postgres numerics that arrive as strings', () => {
    const stats = platformRowsToStats([
      {
        tenant_id: 't1',
        orders: '12',
        cancelled: 1,
        revenue: '4520.50',
        last_order_at: '2026-09-28T03:00:00+00:00',
      },
    ])

    expect(stats.get('t1')).toEqual({
      orders: 12,
      cancelled: 1,
      revenue: 4520.5,
      lastOrderAt: '2026-09-28T03:00:00.000Z',
      isTruncated: false,
    })
  })

  it('treats a garbage number as zero rather than NaN', () => {
    const stats = platformRowsToStats([
      {
        tenant_id: 't1',
        orders: 'x',
        cancelled: null,
        revenue: null,
        last_order_at: null,
      },
    ])

    expect(stats.get('t1')).toMatchObject({
      orders: 0,
      cancelled: 0,
      revenue: 0,
      lastOrderAt: null,
    })
  })
})

describe('convexToStats', () => {
  it('reads the period stats and the newest order time', () => {
    const stats = convexToStats(
      {
        totalOrders: 5,
        totalRevenue: 900,
        statusCounts: { delivered: 5, cancelled: 2 },
      },
      { _creationTime: Date.parse('2026-09-28T03:00:00.000Z') }
    )

    expect(stats).toEqual({
      orders: 5,
      cancelled: 2,
      revenue: 900,
      lastOrderAt: '2026-09-28T03:00:00.000Z',
      isTruncated: false,
    })
  })

  it('flags a window that hit the Convex scan cap, so the count is read as a floor', () => {
    const stats = convexToStats(
      {
        totalOrders: CONVEX_SCAN_LIMIT,
        totalRevenue: 1,
        statusCounts: { delivered: CONVEX_SCAN_LIMIT },
      },
      null
    )

    expect(stats.isTruncated).toBe(true)
    expect(stats.lastOrderAt).toBeNull()
  })
})

describe('buildActivityRows', () => {
  it('gives a platform store with no orders at all a real zero, not a gap', () => {
    const rows = buildActivityRows([tenant()], new Map(), new Map())

    expect(rows[0]).toMatchObject({
      source: 'ok',
      orders: 0,
      lastOrderAt: null,
    })
  })

  it('marks every platform store unreachable when the platform read failed', () => {
    const rows = buildActivityRows([tenant()], null, new Map())

    expect(rows[0]).toMatchObject({ source: 'unreachable', orders: 0 })
  })

  it('never reports a Convex store it could not reach as a store with zero orders', () => {
    const convex: Map<string, ConvexActivityEntry> = new Map([
      ['t2', { source: 'unreachable', stats: null, error: 'timed out' }],
    ])
    const rows = buildActivityRows(
      [tenant({ tenantId: 't2', backend: 'convex' })],
      new Map(),
      convex
    )

    expect(rows[0]).toMatchObject({
      source: 'unreachable',
      error: 'timed out',
    })
  })

  it('marks a Convex store with no deploy key as unreachable', () => {
    const rows = buildActivityRows([tenant({ backend: 'convex' })], new Map(), new Map())

    expect(rows[0].source).toBe('unreachable')
  })

  it('reports a store on its own Supabase project as unsupported', () => {
    const rows = buildActivityRows([tenant({ backend: 'supabase' })], new Map(), new Map())

    expect(rows[0].source).toBe('unsupported')
  })

  it('ranks the busiest store first, and computes the average order', () => {
    const platform = platformRowsToStats([
      {
        tenant_id: 'quiet',
        orders: 2,
        cancelled: 0,
        revenue: 200,
        last_order_at: null,
      },
      {
        tenant_id: 'busy',
        orders: 10,
        cancelled: 0,
        revenue: 3000,
        last_order_at: null,
      },
    ])
    const rows = buildActivityRows(
      [tenant({ tenantId: 'quiet', name: 'Quiet' }), tenant({ tenantId: 'busy', name: 'Busy' })],
      platform,
      new Map()
    )

    expect(rows.map((row) => row.tenantId)).toEqual(['busy', 'quiet'])
    expect(rows[0].avgOrderValue).toBe(300)
  })
})

describe('summarizeActivity', () => {
  it('counts active stores as those that took at least one order', () => {
    const platform = platformRowsToStats([
      {
        tenant_id: 'a',
        orders: 4,
        cancelled: 1,
        revenue: 400,
        last_order_at: null,
      },
      {
        tenant_id: 'b',
        orders: 0,
        cancelled: 2,
        revenue: 0,
        last_order_at: null,
      },
    ])
    const rows = buildActivityRows(
      [
        tenant({ tenantId: 'a' }),
        tenant({ tenantId: 'b' }),
        tenant({ tenantId: 'c', backend: 'convex' }),
      ],
      platform,
      new Map()
    )

    expect(summarizeActivity(rows)).toEqual({
      totalStores: 3,
      activeStores: 1,
      totalOrders: 4,
      totalRevenue: 400,
      cancelled: 3,
      unreachableStores: 1,
      avgOrdersPerActiveStore: 4,
    })
  })

  it('reports zeroes for an empty platform', () => {
    expect(summarizeActivity([])).toMatchObject({
      activeStores: 0,
      avgOrdersPerActiveStore: 0,
    })
  })
})
