/**
 * Merchant-side MCP — Phase 4: the upsell funnel read.
 *
 * Upsell analytics events (`upsell_shown` / `upsell_clicked` /
 * `upsell_converted`) only ever land in a tenant's Convex deployment — that is
 * true regardless of which backend holds the tenant's ORDERS. So this read is
 * Convex-only by design: a tenant without a Convex deployment gets an explicit
 * `available: false`, never a fabricated all-zero funnel.
 */

import {
  fetchUpsellPerformance,
  fetchUpsellPerformanceForTenantId,
  type UpsellPerformanceTenant,
} from '@/lib/queries/upsell-performance'
import { listOps } from '@/lib/mcp/provisioning-ops'
import { listMerchantOps } from '@/lib/mcp/merchant-ops'
import type { ZodObject, ZodRawShape } from 'zod'

const CONVEX_TENANT: UpsellPerformanceTenant = {
  id: 't1',
  convex_deployment_url: 'https://x.convex.cloud',
  convex_deploy_key: 'key',
}

const FUNNEL = { shown: 40, clicked: 10, converted: 4, clickRate: 0.25, conversionRate: 0.1 }

describe('fetchUpsellPerformance', () => {
  it('reads the funnel from analytics:getUpsellAnalytics on the tenant deployment', async () => {
    const convexQuery = jest.fn().mockResolvedValue(FUNNEL)

    const result = await fetchUpsellPerformance(CONVEX_TENANT, {
      windowDays: 14,
      convexFactory: () => ({ query: convexQuery }),
    })

    expect(convexQuery).toHaveBeenCalledWith(
      'analytics:getUpsellAnalytics',
      expect.objectContaining({ daysBack: 14 }),
    )
    expect(result.available).toBe(true)
    expect(result.funnel).toMatchObject({ shown: 40, clicked: 10, converted: 4 })
  })

  it('reports a tenant without a Convex deployment as unavailable, not as zeros', async () => {
    const result = await fetchUpsellPerformance({ id: 't2' }, { windowDays: 14 })

    expect(result.available).toBe(false)
    expect(result.funnel).toBeUndefined()
    expect(result.note).toMatch(/convex|analytics/i)
  })

  it('surfaces a Convex failure as unavailable with the reason', async () => {
    const result = await fetchUpsellPerformance(CONVEX_TENANT, {
      windowDays: 14,
      convexFactory: () => ({ query: jest.fn().mockRejectedValue(new Error('boom')) }),
    })

    expect(result.available).toBe(false)
    expect(result.note).toMatch(/could not be reached|unavailable/i)
  })
})

describe('fetchUpsellPerformanceForTenantId', () => {
  it('resolves the tenant, then reads its deployment', async () => {
    const convexQuery = jest.fn().mockResolvedValue(FUNNEL)
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        Object.assign(b, {
          select: () => b,
          eq: () => b,
          single: () => Promise.resolve({ data: { ...CONVEX_TENANT }, error: null }),
        })
        return b
      },
    }

    const result = await fetchUpsellPerformanceForTenantId(
      't1',
      { client: client as never },
      14,
      { convexFactory: () => ({ query: convexQuery }) },
    )

    expect(result.available).toBe(true)
    expect(result.windowDays).toBe(14)
  })

  it('throws when the tenant does not exist', async () => {
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
      fetchUpsellPerformanceForTenantId('missing', { client: client as never }, 14),
    ).rejects.toThrow(/tenant/i)
  })
})

describe('get_upsell_performance op registration', () => {
  it('is registered on the superadmin surface with a tenantId envelope', () => {
    const op = listOps().find((o) => o.name === 'get_upsell_performance')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).toContain('tenantId')
  })

  it('is exposed to merchants without a tenantId field', () => {
    const op = listMerchantOps().find((o) => o.name === 'get_upsell_performance')
    expect(op).toBeDefined()
    const shape = (op!.input as unknown as ZodObject<ZodRawShape>).shape
    expect(Object.keys(shape)).not.toContain('tenantId')
  })
})
