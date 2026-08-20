/**
 * Merchant-side MCP — Phase 4: the "how is my store doing" read.
 *
 * `get_sales_summary` answers with order count, revenue, average order value
 * and a per-day series over a trailing window, read from whichever backend
 * holds the tenant's orders (same routing rule as menu-performance: never
 * answer from the wrong database, report silence as silence).
 *
 * Every dependency is injected, so these tests open no connections.
 */

import {
  buildSalesSummary,
  platformOrdersToDaily,
  convexTrendsToDaily,
  fetchSalesSummary,
  fetchSalesSummaryForTenantId,
  type SalesSummaryTenant,
} from '@/lib/queries/sales-summary'
import { listOps } from '@/lib/mcp/provisioning-ops'
import { listMerchantOps } from '@/lib/mcp/merchant-ops'
import type { ZodObject, ZodRawShape } from 'zod'

/** A chainable PostgREST double that records the filters it was given. */
function fakeOrdersClient(rows: unknown[], calls: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const chain = (name: string) => (...args: unknown[]) => {
    calls[name] = args
    return builder
  }
  Object.assign(builder, {
    select: chain('select'),
    eq: chain('eq'),
    gte: chain('gte'),
    neq: chain('neq'),
    limit: chain('limit'),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  })
  return { from: (table: string) => { calls.from = table; return builder } }
}

const CONVEX_TENANT: SalesSummaryTenant = {
  id: 't1',
  order_backend: 'convex',
  convex_deployment_url: 'https://x.convex.cloud',
  convex_deploy_key: 'key',
}

const PLATFORM_TENANT: SalesSummaryTenant = { id: 't2', order_backend: 'platform' }

describe('pure daily aggregation', () => {
  it('buckets platform orders by the merchant-local (Asia/Manila) day', () => {
    // 15:30Z is still Aug 10 in Manila; 17:00Z has crossed into Aug 11.
    const days = platformOrdersToDaily([
      { created_at: '2026-08-10T15:30:00Z', total: '100.00' },
      { created_at: '2026-08-10T17:00:00Z', total: 50 },
    ])

    expect(days).toEqual([
      { date: '2026-08-10', orders: 1, revenue: 100 },
      { date: '2026-08-11', orders: 1, revenue: 50 },
    ])
  })

  it('maps Convex getTrends rows straight through', () => {
    const days = convexTrendsToDaily([
      { date: '2026-08-01', totalOrders: 3, totalRevenue: 900, avgOrderValue: 300 },
    ])

    expect(days).toEqual([{ date: '2026-08-01', orders: 3, revenue: 900 }])
  })

  it('totals orders, revenue and AOV across the window', () => {
    const summary = buildSalesSummary({
      dataSource: 'platform',
      windowDays: 7,
      days: [
        { date: '2026-08-01', orders: 2, revenue: 300 },
        { date: '2026-08-02', orders: 1, revenue: 200 },
      ],
    })

    expect(summary.totalOrders).toBe(3)
    expect(summary.totalRevenue).toBe(500)
    expect(summary.avgOrderValue).toBeCloseTo(500 / 3)
    expect(summary.coverage.complete).toBe(true)
  })

  it('reports an empty window as absent data, not a dead restaurant', () => {
    const summary = buildSalesSummary({ dataSource: 'convex', windowDays: 30, days: [] })

    expect(summary.totalOrders).toBe(0)
    expect(summary.avgOrderValue).toBe(0)
    expect(summary.coverage.complete).toBe(false)
    expect(summary.coverage.note).toMatch(/no order data/i)
  })

  it('flags a truncated read so totals are never presented as complete', () => {
    const summary = buildSalesSummary({
      dataSource: 'platform',
      windowDays: 30,
      days: [{ date: '2026-08-01', orders: 1000, revenue: 1 }],
      truncated: true,
    })

    expect(summary.coverage.complete).toBe(false)
    expect(summary.coverage.note).toMatch(/partial|truncated/i)
  })
})

describe('fetchSalesSummary backend routing', () => {
  it('reads a Convex tenant through analytics:getTrends on its own deployment', async () => {
    const convexQuery = jest.fn().mockResolvedValue([
      { date: '2026-08-01', totalOrders: 2, totalRevenue: 600, avgOrderValue: 300 },
    ])

    const result = await fetchSalesSummary(CONVEX_TENANT, {
      windowDays: 30,
      platformClient: fakeOrdersClient([]) as never,
      convexFactory: () => ({ query: convexQuery }),
    })

    expect(convexQuery).toHaveBeenCalledWith('analytics:getTrends', expect.objectContaining({ daysBack: 30 }))
    expect(result.dataSource).toBe('convex')
    expect(result.totalOrders).toBe(2)
    expect(result.totalRevenue).toBe(600)
  })

  it('reads a platform tenant from the orders table filtered to that tenant', async () => {
    const calls: Record<string, unknown> = {}
    const client = fakeOrdersClient(
      [{ created_at: '2026-08-10T02:00:00Z', total: '250.00' }],
      calls,
    )

    const result = await fetchSalesSummary(PLATFORM_TENANT, {
      windowDays: 30,
      platformClient: client as never,
    })

    expect(calls.from).toBe('orders')
    expect(calls.eq).toEqual(['tenant_id', 't2'])
    expect(calls.neq).toEqual(['status', 'cancelled'])
    expect(result.dataSource).toBe('platform')
    expect(result.totalOrders).toBe(1)
    expect(result.totalRevenue).toBe(250)
  })

  it('refuses to fall back when Convex credentials are missing', async () => {
    const result = await fetchSalesSummary(
      { id: 't4', order_backend: 'convex' } as SalesSummaryTenant,
      { windowDays: 30, platformClient: fakeOrdersClient([]) as never },
    )

    expect(result.dataSource).toBe('convex')
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/credential|misconfigur/i)
  })

  it('surfaces a Convex failure as an unavailable note, never as zeros', async () => {
    const result = await fetchSalesSummary(CONVEX_TENANT, {
      windowDays: 30,
      platformClient: fakeOrdersClient([]) as never,
      convexFactory: () => ({ query: jest.fn().mockRejectedValue(new Error('boom')) }),
    })

    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/could not be reached|unavailable/i)
  })
})

describe('fetchSalesSummaryForTenantId', () => {
  it('resolves the tenant, then reads through that tenant\'s own backend', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'tenants') {
          const b: Record<string, unknown> = {}
          Object.assign(b, {
            select: () => b,
            eq: () => b,
            single: () => Promise.resolve({ data: { ...PLATFORM_TENANT }, error: null }),
          })
          return b
        }
        return fakeOrdersClient([{ created_at: '2026-08-10T02:00:00Z', total: 100 }]).from(table)
      },
    }

    const result = await fetchSalesSummaryForTenantId('t2', { client: client as never }, 14)

    expect(result.dataSource).toBe('platform')
    expect(result.windowDays).toBe(14)
    expect(result.totalOrders).toBe(1)
  })

  it('throws when the tenant does not exist rather than reporting zero sales', async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        Object.assign(b, {
          select: () => b,
          eq: () => b,
          single: () => Promise.resolve({ data: null, error: { message: 'no rows' } }),
        })
        return b
      },
    }

    await expect(
      fetchSalesSummaryForTenantId('missing', { client: client as never }),
    ).rejects.toThrow(/tenant/i)
  })
})

describe('get_sales_summary op registration', () => {
  it('is registered on the superadmin surface with a tenantId envelope', () => {
    const op = listOps().find((o) => o.name === 'get_sales_summary')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).toContain('tenantId')
  })

  it('is exposed to merchants without a tenantId field', () => {
    const op = listMerchantOps().find((o) => o.name === 'get_sales_summary')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).not.toContain('tenantId')
  })
})
