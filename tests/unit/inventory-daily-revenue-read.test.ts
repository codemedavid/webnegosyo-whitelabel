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

import { getDailyRevenue, revenueBasisFor } from '@/lib/inventory/daily-revenue-read'
import { inclusiveEndFor } from '@/lib/convex/period-bounds'
import { REPORT_ORDER_COLUMNS } from '@/lib/reports/read/platform-order-row'

let nextId = 0

/**
 * One platform order row as the reader selects it. Only the money columns
 * matter here; the rest are what `toReportOrder` needs to read a row at all.
 */
function orderRow(
  total: number,
  extra: { service_charge_amount?: number; delivery_fee?: number; discount_data?: unknown } = {},
) {
  nextId += 1
  return {
    id: `o${nextId}`,
    created_at: '2026-07-29T02:00:00.000Z',
    status: 'completed',
    payment_status: 'paid',
    source: 'web',
    order_type: 'pickup',
    outlet_id: null,
    total,
    service_charge_amount: extra.service_charge_amount ?? 0,
    delivery_fee: extra.delivery_fee ?? 0,
    discount_data: extra.discount_data ?? null,
    customer_data: {},
    payment_method_id: null,
    payment_method_name: null,
  }
}

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

  for (const method of ['select', 'eq', 'neq', 'not', 'gte', 'lt', 'order', 'range']) {
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

/** A client whose builder answers `range(from, to)` with that slice of `rows`. */
function pagedSupabase(rows: ReadonlyArray<ReturnType<typeof orderRow>>) {
  const ranges: Array<[number, number]> = []
  const from = () => {
    let slice: [number, number] = [0, rows.length]
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows.slice(slice[0], slice[1] + 1), error: null }),
      range: (start: number, end: number) => {
        ranges.push([start, end])
        slice = [start, end]
        return builder
      },
    }
    for (const method of ['select', 'eq', 'neq', 'not', 'gte', 'lt', 'order']) builder[method] = () => builder
    return builder
  }
  return { ranges, from }
}

describe('getDailyRevenue — platform backend', () => {
  test('reports NET SALES: what the food sold for, not what the customer paid in fees', async () => {
    // Food cost % divides by this. Delivery fees and service charges are
    // income the food did not earn, so dividing by the order total made every
    // delivery-heavy store's food cost look better than it was (plan §1.3 #3).
    const client = fakeSupabase({
      data: [
        orderRow(1150, { service_charge_amount: 50, delivery_fee: 100 }),
        orderRow(500),
      ],
      error: null,
    })

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(revenue).toBe(1500)
    expect(argsFor(client, 'select')).toEqual([REPORT_ORDER_COLUMNS])
  })

  test('leaves out an order the sales model does not count as a sale', async () => {
    // A negative total is a correction row, not a sale (sales-model isLiveOrder).
    const client = fakeSupabase({ data: [orderRow(500), orderRow(-200)], error: null })

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(revenue).toBe(500)
  })

  test('takes a food discount off sales, and a delivery discount off the delivery fee only', async () => {
    // ₱1,000 of food − ₱100 senior discount + ₱80 delivery − ₱30 off delivery = ₱950 paid;
    // the food sold for ₱900.
    const discount = {
      total: 130,
      deliveryDiscount: 30,
      lines: [{ label: 'Senior Citizen discount', amount: 100 }],
      allocationsByLine: {},
    }
    const client = fakeSupabase({
      data: [orderRow(950, { delivery_fee: 80, discount_data: discount })],
      error: null,
    })

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(revenue).toBe(900)
  })


  test('reads past the 1000-row page cap instead of summing the first page', async () => {
    // A busy branch passes 1,000 orders a day; an unpaged read summed the
    // first 1,000 and called it the day.
    const client = pagedSupabase(Array.from({ length: 2500 }, () => orderRow(2)))

    const revenue = await getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never })

    expect(revenue).toBe(5000)
    expect(client.ranges[0]).toEqual([0, 999])
  })

  test('sums the day\'s order totals when nothing but food was sold', async () => {
    // Arrange
    const client = fakeSupabase({
      data: [orderRow(1200.5), orderRow(300), orderRow(99.5)],
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

  test('excludes every reversed order, by the sales model\'s one list', () => {
    // A cancelled, refunded or voided order took no money, and its stock is
    // netted off by the void on the cost side — counting it as revenue would
    // flatter the ratio twice. The list is REVERSED_STATUSES, the same one the
    // sales model uses, so the two cannot disagree about what a sale is.
    const client = fakeSupabase({ data: [], error: null })

    return getDailyRevenue({ id: 't1' }, DAY, { platformClient: async () => client as never }).then(() => {
      expect(argsFor(client, 'not')).toEqual(['status', 'in', '(cancelled,canceled,refunded,voided)'])
    })
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
    const tenantDb = fakeSupabase({ data: [orderRow(750)], error: null })
    const platformDb = fakeSupabase({ data: [orderRow(999999)], error: null })

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
    expect(query).toHaveBeenCalledWith('orders:getDashboardStatsByPeriodInternal', {
      startDate: Date.parse(WINDOW_START),
      // getDashboardStatsByPeriod is INCLUSIVE at both ends: an order at
      // exactly the next midnight would count on two days.
      endDate: inclusiveEndFor(Date.parse(WINDOW_END)),
    })
  })

  test('routes to Convex on the deployment URL alone, with no pin', async () => {
    // `order_backend` was added late and is unwritten on older rows; deriving
    // from the credentials is what keeps this read agreeing with checkout.
    const query = jest.fn().mockResolvedValue({ totalRevenue: 10 })

    await getDailyRevenue({ ...TENANT, id: 't3' }, DAY, { convexClient: () => ({ query }) })

    expect(query).toHaveBeenCalled()
  })

  test('returns null when the deployment errors', async () => {
    const query = jest.fn().mockRejectedValue(new Error('deployment asleep'))

    const revenue = await getDailyRevenue(TENANT, DAY, { convexClient: () => ({ query }) })

    expect(revenue).toBeNull()
  })

  test('returns null when the deployment times out rather than hanging the page', async () => {
    const query = jest.fn((): Promise<never> => new Promise(() => {}))

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

describe('getDailyRevenue — one branch of the store', () => {
  test('narrows the platform read to the branch', async () => {
    // Without this the web report divides one branch's stock cost by the whole
    // chain's takings, which understates the food cost by roughly the number of
    // branches. Understating is the dangerous direction: it gets believed.
    const client = fakeSupabase({ data: [orderRow(500)], error: null })

    await getDailyRevenue(
      { id: 't1', order_backend: 'platform' } as never,
      '2026-08-01',
      { platformClient: async () => client as never },
      'north',
    )

    expect(client.calls).toContainEqual({ method: 'eq', args: ['outlet_id', 'north'] })
  })

  test('narrows a per-tenant Supabase read the same way', async () => {
    // Same schema, different client — the branch column is there either way.
    const client = fakeSupabase({ data: [orderRow(500)], error: null })

    await getDailyRevenue(
      { id: 't1', order_backend: 'supabase' } as never,
      '2026-08-01',
      { tenantClient: () => client as never },
      'north',
    )

    expect(client.calls).toContainEqual({ method: 'eq', args: ['outlet_id', 'north'] })
  })

  test('leaves a store-wide read unfiltered', async () => {
    // The owner's report is the default and must not acquire a branch filter by
    // accident: silently narrowed, they would see a fraction of their takings
    // with nothing on screen to say so.
    const client = fakeSupabase({ data: [orderRow(500)], error: null })

    await getDailyRevenue(
      { id: 't1', order_backend: 'platform' } as never,
      '2026-08-01',
      { platformClient: async () => client as never },
    )

    const branchFilters = client.calls.filter(
      (call) => call.method === 'eq' && (call.args as string[])[0] === 'outlet_id',
    )
    expect(branchFilters).toHaveLength(0)
  })

  test('still sums the day when a branch is named', async () => {
    // The filter must narrow the query, not replace the arithmetic.
    const client = fakeSupabase({ data: [orderRow(300), orderRow(200)], error: null })

    const revenue = await getDailyRevenue(
      { id: 't1', order_backend: 'platform' } as never,
      '2026-08-01',
      { platformClient: async () => client as never },
      'north',
    )

    expect(revenue).toBe(500)
  })
})

describe('getDailyRevenue — asking Convex for one branch', () => {
  test('passes the branch to the deployment', async () => {
    const query = jest.fn().mockResolvedValue({ totalRevenue: 400 })

    await getDailyRevenue(
      { id: 't1', convex_deployment_url: 'https://x.convex.cloud', convex_deploy_key: 'k' } as never,
      '2026-08-01',
      { convexClient: () => ({ query }) as never },
      'north',
    )

    expect(query).toHaveBeenCalledWith(
      'orders:getDashboardStatsByPeriodInternal',
      expect.objectContaining({ outletId: 'north' }),
    )
  })

  test('sends no branch key at all for a store-wide read', async () => {
    // Not `outletId: undefined` — a Convex validator still sees the key, and an
    // older deployment rejects it. The caller must be able to keep asking
    // exactly what it asks today.
    const query = jest.fn().mockResolvedValue({ totalRevenue: 400 })

    await getDailyRevenue(
      { id: 't1', convex_deployment_url: 'https://x.convex.cloud', convex_deploy_key: 'k' } as never,
      '2026-08-01',
      { convexClient: () => ({ query }) as never },
    )

    expect(Object.keys(query.mock.calls[0][1])).not.toContain('outletId')
  })
})

describe('revenueBasisFor', () => {
  test('says which figure the screen is showing', () => {
    // A Convex deployment answers only its order totals (fees included), so
    // the screen must not call that figure net sales.
    expect(revenueBasisFor({ order_backend: 'platform' } as never)).toBe('net_sales')
    expect(revenueBasisFor({ order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' } as never)).toBe('order_totals')
  })
})
