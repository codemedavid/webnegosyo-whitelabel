/**
 * Phase 2 — reading one Manila day's takings, whichever backend holds them.
 *
 * The ledger is ALWAYS platform-side, but orders are not: a tenant's orders live
 * in the shared platform project, in its own Supabase project, or in its own
 * Convex deployment. A revenue read that only knew about the platform database
 * would hand every Convex tenant a zero, and a zero denominator turns into a
 * flawless-looking food cost. So the routing is the feature, and every failure
 * path here must produce `null` — never `0`.
 */

import { getDailyRevenue } from '@/lib/inventory/daily-revenue-read'

/**
 * A Supabase client that records its calls and resolves to a fixed result.
 *
 * The CLIENT must not itself be thenable — it is handed back from an async
 * factory, and a thenable would be unwrapped by `await` into the query result
 * before the caller ever saw a client. Only the builder `from()` returns is
 * awaitable, which is also how the real client behaves.
 */
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  }

  for (const method of ['select', 'eq', 'neq', 'gte', 'lt']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }

  return {
    calls,
    from: (...args: unknown[]) => {
      calls.push({ method: 'from', args })
      return builder
    },
  }
}

const DAY = '2026-07-29'
/** The half-open Manila window for DAY, in UTC. */
const WINDOW_START = '2026-07-28T16:00:00.000Z'
const WINDOW_END = '2026-07-29T16:00:00.000Z'

function argsFor(client: ReturnType<typeof fakeSupabase>, method: string): unknown[] {
  const call = client.calls.find((entry) => entry.method === method)
  return call ? call.args : []
}

describe('getDailyRevenue — platform backend', () => {
  test('sums the day\'s order totals', async () => {
    // Arrange
    const client = fakeSupabase({
      data: [{ total: 1200.5 }, { total: 300 }, { total: 99.5 }],
      error: null,
    })

    // Act
    const revenue = await getDailyRevenue({ id: 't1' }, DAY, {
      platformClient: async () => client as never,
    })

    // Assert
    expect(revenue).toBe(1600)
  })

  test('asks for the half-open Manila window, not a UTC day', async () => {
    // A UTC boundary cuts a Philippine dinner service in half, so the takings
    // and the stock movements would be describing different days.
    const client = fakeSupabase({ data: [], error: null })

    await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(argsFor(client, 'gte')).toEqual(['created_at', WINDOW_START])
    expect(argsFor(client, 'lt')).toEqual(['created_at', WINDOW_END])
  })

  test('excludes cancelled orders', async () => {
    // A cancelled order took no money, and its stock is netted off by the void
    // on the cost side — counting it as revenue would flatter the ratio twice.
    const client = fakeSupabase({ data: [], error: null })

    await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(argsFor(client, 'neq')).toEqual(['status', 'cancelled'])
  })

  test('scopes to the tenant', async () => {
    const client = fakeSupabase({ data: [], error: null })

    await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(argsFor(client, 'eq')).toEqual(['tenant_id', 't1'])
  })

  test('reports a genuine zero when the day sold nothing', async () => {
    // Distinct from an unreadable backend: this day is real and really took
    // nothing, which the caveat can then say in words.
    const client = fakeSupabase({ data: [], error: null })

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, {
      platformClient: async () => client as never,
    })

    expect(revenue).toBe(0)
  })

  test('returns null, not zero, when the query fails', async () => {
    const client = fakeSupabase({ data: null, error: { message: 'permission denied' } })

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, {
      platformClient: async () => client as never,
    })

    expect(revenue).toBeNull()
  })

  test('returns null when the client itself cannot be built', async () => {
    const revenue = await getDailyRevenue({ id: 't1' }, DAY, {
      platformClient: async () => {
        throw new Error('no cookies in this context')
      },
    })

    expect(revenue).toBeNull()
  })
})

describe('getDailyRevenue — per-tenant Supabase backend', () => {
  const TENANT = {
    id: 't2',
    order_backend: 'supabase' as const,
    supabase_order_url: 'https://tenant.supabase.co',
    supabase_order_service_key: 'service-key',
  }

  test('reads the tenant\'s own project rather than the platform one', async () => {
    // Arrange
    const tenantDb = fakeSupabase({ data: [{ total: 750 }], error: null })
    const platformDb = fakeSupabase({ data: [{ total: 999999 }], error: null })

    // Act
    const revenue = await getDailyRevenue(TENANT, DAY, {
      tenantClient: () => tenantDb as never,
      platformClient: async () => platformDb as never,
    })

    // Assert
    expect(revenue).toBe(750)
    expect(platformDb.calls).toHaveLength(0)
  })

  test('returns null when the tenant project is misconfigured', async () => {
    const revenue = await getDailyRevenue(
      { id: 't2', order_backend: 'supabase' },
      DAY,
      {
        tenantClient: () => {
          throw new Error('supabase_order_url is missing')
        },
      },
    )

    expect(revenue).toBeNull()
  })
})

describe('getDailyRevenue — Convex backend', () => {
  const TENANT = {
    id: 't3',
    convex_deployment_url: 'https://acme.convex.cloud',
    convex_deploy_key: 'deploy-key',
  }

  test('asks the deployment for the window\'s takings', async () => {
    // Arrange
    const query = jest.fn().mockResolvedValue({ totalRevenue: 4500 })

    // Act
    const revenue = await getDailyRevenue(TENANT, DAY, { convexClient: () => ({ query }) })

    // Assert
    expect(revenue).toBe(4500)
    expect(query).toHaveBeenCalledWith('orders:getDashboardStatsByPeriod', {
      startDate: Date.parse(WINDOW_START),
      endDate: Date.parse(WINDOW_END),
    })
  })

  test('routes to Convex on the deployment URL alone, with no pin', async () => {
    // `order_backend` was added late and is unwritten on older rows; deriving
    // from the credentials is what keeps this read agreeing with checkout.
    const query = jest.fn().mockResolvedValue({ totalRevenue: 10 })

    await getDailyRevenue({ id: 't3', ...TENANT }, DAY, { convexClient: () => ({ query }) })

    expect(query).toHaveBeenCalled()
  })

  test('returns null when the deployment errors', async () => {
    const query = jest.fn().mockRejectedValue(new Error('deployment asleep'))

    const revenue = await getDailyRevenue(TENANT, DAY, { convexClient: () => ({ query }) })

    expect(revenue).toBeNull()
  })

  test('returns null when the deployment times out rather than hanging the page', async () => {
    const query = jest.fn(() => new Promise(() => {}))

    const revenue = await getDailyRevenue(TENANT, DAY, {
      convexClient: () => ({ query }),
      timeoutMs: 20,
    })

    expect(revenue).toBeNull()
  })

  test('returns null when the deploy key is missing', async () => {
    // Convex is pinned but unusable; a zero here would read as a dead-quiet day.
    const revenue = await getDailyRevenue(
      { id: 't3', order_backend: 'convex', convex_deployment_url: 'https://acme.convex.cloud' },
      DAY,
      {
        convexClient: () => {
          throw new Error('missing deploy key')
        },
      },
    )

    expect(revenue).toBeNull()
  })

  test('returns null when the deployment answers without a revenue figure', async () => {
    const query = jest.fn().mockResolvedValue({ orderCount: 3 })

    const revenue = await getDailyRevenue(TENANT, DAY, { convexClient: () => ({ query }) })

    expect(revenue).toBeNull()
  })
})
