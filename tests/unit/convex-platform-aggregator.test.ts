import { fetchConvexAggregates, type ConvexTenantTarget } from '@/lib/queries/convex-platform-aggregator'
import { rangeToWindows } from '@/lib/queries/platform-analytics-merge'

const NOW = Date.parse('2026-07-08T12:00:00Z')
const windows7d = rangeToWindows('7d', NOW)

interface Recorded {
  url: string
  key: string
  path: string
  args: Record<string, unknown>
}

/** Build a fake Convex client factory that records calls and returns canned data. */
function makeFactory(opts?: {
  failUrls?: Set<string>
  slowUrls?: Set<string>
  recorded?: Recorded[]
}) {
  const recorded = opts?.recorded ?? []
  return (url: string, key: string) => ({
    async query<T>(path: string, args: Record<string, unknown>): Promise<T> {
      recorded.push({ url, key, path, args })
      if (opts?.failUrls?.has(url)) throw new Error('boom')
      if (opts?.slowUrls?.has(url)) {
        await new Promise((r) => setTimeout(r, 10_000)) // never resolves within timeout
      }
      if (path === 'orders:getDashboardStatsByPeriod') {
        // distinguish current vs previous window by startDate
        const isPrev = args.startDate === windows7d.prevStartMs
        return (isPrev
          ? { totalOrders: 5, totalRevenue: 1000, avgOrderValue: 200, statusCounts: { delivered: 5, cancelled: 0 } }
          : { totalOrders: 10, totalRevenue: 3000, avgOrderValue: 300, statusCounts: { delivered: 8, cancelled: 2 } }) as T
      }
      if (path === 'analytics:getTrends') {
        return [
          { date: '2026-07-08', totalOrders: 10, totalRevenue: 3000, avgOrderValue: 300 },
        ] as T
      }
      if (path === 'analytics:getRevenueBreakdown') {
        return {
          byOrderType: [{ type: 'Dine In', revenue: 3000, count: 10 }],
          byPaymentMethod: [{ method: 'GCash', revenue: 3000, count: 10 }],
        } as T
      }
      throw new Error(`unexpected path ${path}`)
    },
  })
}

const tenants: ConvexTenantTarget[] = [
  { tenantId: 'A', url: 'https://a.convex.cloud', key: 'keyA' },
  { tenantId: 'B', url: 'https://b.convex.cloud', key: 'keyB' },
]

describe('fetchConvexAggregates', () => {
  it('returns one aggregate per tenant with merged current-window stats', async () => {
    const aggs = await fetchConvexAggregates(tenants, windows7d, { factory: makeFactory(), needBreakdown: true })
    expect(aggs).toHaveLength(2)
    const a = aggs.find((x) => x.tenantId === 'A')!
    expect(a.orders).toBe(10)
    expect(a.gmv).toBe(3000)
    expect(a.completed).toBe(8)
    expect(a.cancelled).toBe(2)
    expect(a.prevOrders).toBe(5)
    expect(a.prevGmv).toBe(1000)
    expect(a.daily['2026-07-08']).toEqual({ orders: 10, revenue: 3000 })
    expect(a.orderType['Dine In']).toEqual({ count: 10, revenue: 3000 })
  })

  it('authenticates each call with the tenant deploy key and correct window args', async () => {
    const recorded: Recorded[] = []
    await fetchConvexAggregates(tenants, windows7d, { factory: makeFactory({ recorded }), needBreakdown: true })
    const aCalls = recorded.filter((r) => r.url === 'https://a.convex.cloud')
    expect(aCalls.every((c) => c.key === 'keyA')).toBe(true)
    const current = aCalls.find(
      (c) => c.path === 'orders:getDashboardStatsByPeriod' && c.args.startDate === windows7d.startMs,
    )
    expect(current).toBeDefined()
    expect(current!.args.endDate).toBe(windows7d.endMs)
  })

  it('does not query the previous window for the all range', async () => {
    const recorded: Recorded[] = []
    const windowsAll = rangeToWindows('all', NOW)
    await fetchConvexAggregates(tenants, windowsAll, { factory: makeFactory({ recorded }) })
    const periodCalls = recorded.filter((r) => r.path === 'orders:getDashboardStatsByPeriod')
    // exactly one per tenant (current only; no previous window)
    expect(periodCalls).toHaveLength(2)
    // 'all' starts from epoch 0
    expect(periodCalls[0].args.startDate).toBe(0)
  })

  it('skips the revenue breakdown query when needBreakdown is false', async () => {
    const recorded: Recorded[] = []
    await fetchConvexAggregates(tenants, windows7d, { factory: makeFactory({ recorded }), needBreakdown: false })
    expect(recorded.some((r) => r.path === 'analytics:getRevenueBreakdown')).toBe(false)
  })

  it('degrades a failing tenant to a zero aggregate without dropping the others', async () => {
    const factory = makeFactory({ failUrls: new Set(['https://a.convex.cloud']) })
    const aggs = await fetchConvexAggregates(tenants, windows7d, { factory })
    const a = aggs.find((x) => x.tenantId === 'A')!
    const b = aggs.find((x) => x.tenantId === 'B')!
    expect(a.orders).toBe(0)
    expect(a.gmv).toBe(0)
    expect(b.orders).toBe(10) // healthy tenant unaffected
  })

  it('degrades a slow tenant to a zero aggregate via timeout', async () => {
    const factory = makeFactory({ slowUrls: new Set(['https://b.convex.cloud']) })
    const aggs = await fetchConvexAggregates(tenants, windows7d, { factory, timeoutMs: 50 })
    const b = aggs.find((x) => x.tenantId === 'B')!
    expect(b.orders).toBe(0)
  })

  it('returns an empty array for no tenants', async () => {
    const aggs = await fetchConvexAggregates([], windows7d, { factory: makeFactory() })
    expect(aggs).toEqual([])
  })
})
