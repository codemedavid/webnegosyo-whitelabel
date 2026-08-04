/**
 * Backend routing for the MCP's menu-performance read.
 *
 * The whole point of this shell is that it asks the SAME question of whichever
 * database a tenant's orders actually live in. Getting that wrong is not a
 * cosmetic bug: the superadmin analytics dashboard once read only the platform
 * database, so every Convex-backed (i.e. genuinely busy) restaurant reported
 * zero. Here the same mistake would tell an AI to delete a profitable menu.
 *
 * Every dependency is injected, so these tests open no connections.
 */

import { fetchMenuPerformance, fetchMenuPerformanceForTenantId } from '@/lib/queries/menu-performance'

/** A chainable PostgREST double that records the filters it was given. */
function fakeOrderItemsClient(rows: unknown[], calls: Record<string, unknown> = {}) {
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

const CONVEX_TENANT = {
  id: 't1',
  order_backend: 'convex',
  convex_deployment_url: 'https://x.convex.cloud',
  convex_deploy_key: 'key',
}

const PLATFORM_TENANT = { id: 't2', order_backend: 'platform' }

const TENANT_SUPABASE_TENANT = {
  id: 't3',
  order_backend: 'supabase',
  supabase_order_url: 'https://tenant.supabase.co',
  supabase_order_anon_key: 'anon',
  supabase_order_service_key: 'service',
}

describe('fetchMenuPerformance backend routing', () => {
  it('reads a Convex tenant from its own deployment, not the platform database', async () => {
    // Arrange
    const convexQuery = jest.fn().mockResolvedValue([
      { itemId: 'a', name: 'Sisig', count: 9, revenue: 1800 },
    ])
    const platformClient = fakeOrderItemsClient([])

    // Act
    const result = await fetchMenuPerformance(CONVEX_TENANT, {
      windowDays: 30,
      platformClient: platformClient as never,
      convexFactory: () => ({ query: convexQuery }),
    })

    // Assert
    expect(convexQuery).toHaveBeenCalled()
    expect(result.dataSource).toBe('convex')
    expect(result.items[0]).toMatchObject({ itemId: 'a', units: 9 })
  })

  it('reads a platform tenant by joining order_items through orders', async () => {
    // order_items has NO tenant_id column, so the tenant filter has to travel
    // through the orders join. Filtering order_items.tenant_id directly would
    // error or silently match nothing.
    const calls: Record<string, unknown> = {}
    const platformClient = fakeOrderItemsClient(
      [{ menu_item_id: 'b', menu_item_name: 'Adobo', quantity: 2, subtotal: '300.00' }],
      calls,
    )

    const result = await fetchMenuPerformance(PLATFORM_TENANT, {
      windowDays: 30,
      platformClient: platformClient as never,
    })

    expect(calls.from).toBe('order_items')
    expect(String(calls.select)).toContain('orders')
    expect(result.dataSource).toBe('platform')
    expect(result.items[0]).toMatchObject({ itemId: 'b', units: 2, revenue: 300 })
  })

  it('reads a tenant-Supabase tenant from its own project', async () => {
    const calls: Record<string, unknown> = {}
    const tenantClient = fakeOrderItemsClient(
      [{ menu_item_id: 'c', menu_item_name: 'Pancit', quantity: 4, subtotal: '400.00' }],
      calls,
    )

    const result = await fetchMenuPerformance(TENANT_SUPABASE_TENANT, {
      windowDays: 30,
      platformClient: fakeOrderItemsClient([]) as never,
      tenantSupabaseFactory: () => tenantClient as never,
    })

    expect(result.dataSource).toBe('tenant_supabase')
    expect(result.items[0]).toMatchObject({ itemId: 'c', units: 4 })
  })

  it('reports a Convex tenant with no orders as absent data, not as zero sales', async () => {
    const result = await fetchMenuPerformance(CONVEX_TENANT, {
      windowDays: 30,
      platformClient: fakeOrderItemsClient([]) as never,
      convexFactory: () => ({ query: jest.fn().mockResolvedValue([]) }),
    })

    expect(result.items).toEqual([])
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/no order data/i)
  })

  it('surfaces a Convex failure as an explicit unavailable coverage note, never as zeros', async () => {
    // A dead deployment must not look like a quiet restaurant.
    const result = await fetchMenuPerformance(CONVEX_TENANT, {
      windowDays: 30,
      platformClient: fakeOrderItemsClient([]) as never,
      convexFactory: () => ({ query: jest.fn().mockRejectedValue(new Error('boom')) }),
    })

    expect(result.items).toEqual([])
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/could not be reached|unavailable/i)
  })

  it('refuses to fall back to the platform database when Convex credentials are missing', async () => {
    // Falling back would answer the question from the WRONG database and look
    // authoritative doing it.
    const result = await fetchMenuPerformance(
      { id: 't4', order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' },
      { windowDays: 30, platformClient: fakeOrderItemsClient([]) as never },
    )

    expect(result.dataSource).toBe('convex')
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/credential|misconfigur/i)
  })

  it('flags the Convex read as truncated when it returns a full page', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      itemId: `i${i}`, name: `Item ${i}`, count: 1, revenue: 10,
    }))
    const result = await fetchMenuPerformance(CONVEX_TENANT, {
      windowDays: 30,
      convexLimit: 500,
      platformClient: fakeOrderItemsClient([]) as never,
      convexFactory: () => ({ query: jest.fn().mockResolvedValue(rows) }),
    })

    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/partial|truncated/i)
  })
})

describe('fetchMenuPerformanceForTenantId', () => {
  /** A platform client that answers the tenant lookup, then the order query. */
  function clientReturning(tenantRow: unknown, orderRows: unknown[] = []) {
    return {
      from: (table: string) => {
        if (table === 'tenants') {
          const b: Record<string, unknown> = {}
          Object.assign(b, {
            select: () => b,
            eq: () => b,
            single: () => Promise.resolve({ data: tenantRow, error: null }),
          })
          return b
        }
        return fakeOrderItemsClient(orderRows).from(table)
      },
    }
  }

  it('resolves the tenant, then reads through that tenant\'s own backend', async () => {
    const client = clientReturning({ ...PLATFORM_TENANT }, [
      { menu_item_id: 'z', menu_item_name: 'Halo-halo', quantity: 3, subtotal: '450.00' },
    ])

    const result = await fetchMenuPerformanceForTenantId('t2', { client: client as never }, 14)

    expect(result.dataSource).toBe('platform')
    expect(result.windowDays).toBe(14)
    expect(result.items[0]).toMatchObject({ itemId: 'z', units: 3 })
  })

  it('throws when the tenant does not exist rather than reporting an empty menu', async () => {
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
      fetchMenuPerformanceForTenantId('missing', { client: client as never }),
    ).rejects.toThrow(/tenant/i)
  })
})
