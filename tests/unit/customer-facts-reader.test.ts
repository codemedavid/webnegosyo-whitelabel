/**
 * Reading customer order facts from whichever database a tenant's orders and
 * identities actually live in.
 *
 * The defect this closes: customer KPIs came from ONE place — Convex
 * `analytics:getCustomerInsights` — so a platform-Supabase or tenant-Supabase
 * restaurant saw no customer metrics at all, and a Convex restaurant's metrics
 * never included its POS sales.
 *
 * The rule inherited from `menu-performance.ts`: a backend that cannot be
 * reached returns EMPTY plus a coverage note. It never falls back to another
 * database, because answering authoritatively from the wrong project is exactly
 * how the superadmin dashboard came to report zeros for every Convex tenant.
 */
import { fetchCustomerOrderFacts } from '@/lib/queries/customer-facts'
import { fakeSupabaseTables } from '../fixtures/fake-supabase-tables'

type Row = Record<string, unknown>

interface Recorded {
  table: string
  filters: Array<[string, string, unknown]>
}

/**
 * Minimal chainable stand-in for the Supabase query builder. Records what was
 * asked for so the tests can assert the tenant filter is present — a missing
 * `.eq('tenant_id', …)` would read every restaurant's customers.
 */
function fakeClient(
  responses: Record<string, { data?: Row[]; error?: { message: string } }>,
  beforeRead?: (record: Recorded) => Promise<void>,
) {
  const calls: Recorded[] = []

  function from(table: string) {
    const record: Recorded = { table, filters: [] }
    calls.push(record)

    const builder: Record<string, unknown> = {}
    let page: [number, number] | null = null
    for (const method of ['select', 'gte', 'lte', 'limit', 'order', 'in', 'neq', 'range']) {
      builder[method] = (...args: unknown[]) => {
        if (method === 'in' || method === 'gte') record.filters.push([method, String(args[0]), args[1]])
        if (method === 'range') page = [Number(args[0]), Number(args[1])]
        return builder
      }
    }
    builder.eq = (column: string, value: unknown) => {
      record.filters.push(['eq', column, value])
      return builder
    }
    builder.then = async (resolve: (value: unknown) => unknown) => {
      await beforeRead?.(record)
      const response = responses[table] ?? { data: [] }
      const ids = record.filters.find(([method]) => method === 'in')
      const data = ids && response.data
        ? response.data.filter(row => (ids[2] as unknown[]).includes(row[ids[1]]))
        : response.data
      return Promise.resolve(page && response.data
        ? { ...response, data: data?.slice(page[0], page[1] + 1) }
        : response).then(resolve)
    }

    return builder
  }

  return { client: { from } as never, calls }
}

/** `count` distinct orders, one minute apart, in random-looking id order. */
function manyOrders(count: number): Array<Record<string, unknown>> {
  const start = Date.parse('2026-09-01T00:00:00.000Z')
  return Array.from({ length: count }, (_, index) => ({
    id: `order-${index}`, tenant_id: 'tenant-1', customer_id: 'customer-a', customer_contact: null, status: 'delivered',
    payment_status: 'paid', outlet_id: null, total: 10, source: 'web',
    created_at: new Date(start + ((index * 7919) % count) * 60_000).toISOString(),
    updated_at: '2026-09-01T03:00:00.000Z',
  }))
}

/**
 * The 1000-row-capped platform fake, with a hook that runs before each read
 * settles (to hold reads open, or to change the table between pages).
 */
function delayedTables(
  tables: Record<string, Array<Record<string, unknown>>>,
  beforeRead?: (table: string) => Promise<void>,
  failures: Record<string, string> = {},
) {
  const fake = fakeSupabaseTables(tables, failures)
  const inner = fake.client as unknown as { from: (table: string) => Record<string, unknown> }
  const client = {
    from(table: string) {
      const query = inner.from(table)
      const settle = query.then as (resolve: unknown, reject: unknown) => Promise<unknown>
      query.then = async (resolve: unknown, reject: unknown) => {
        await beforeRead?.(table)
        return settle(resolve, reject)
      }
      return query
    },
  }
  return { client: client as never, requests: fake.requests }
}

/** The Reports tab reads the whole history. */
const LIFETIME = { days: 90, includeLifetime: true, platformClient: undefined as never }

const PLATFORM_TENANT = { id: 'tenant-1', order_backend: 'platform' as const }
const CONVEX_TENANT = {
  id: 'tenant-1',
  order_backend: 'convex' as const,
  convex_deployment_url: 'https://x.convex.cloud',
}

describe('fetchCustomerOrderFacts', () => {
  it('can include lifetime history so a recent visit recognizes an older customer', async () => {
    const { client, calls } = fakeClient({ orders: { data: [] } })
    await fetchCustomerOrderFacts(PLATFORM_TENANT, {
      days: 90, includeLifetime: true, platformClient: client,
    })
    expect(calls[0].filters.some(([operation]) => operation === 'gte')).toBe(false)
  })
  it('reads orders and their items for a platform-backed tenant', async () => {
    const { client, calls } = fakeClient({
      orders: {
        data: [
          {
            id: 'order-1',
            customer_id: 'customer-a',
            customer_contact: '+639171234567',
            status: 'delivered',
            payment_status: 'paid',
            outlet_id: null,
            total: '250.00',
            created_at: '2026-09-01T02:00:00.000Z',
            updated_at: '2026-09-01T03:00:00.000Z',
            source: 'web',
          },
        ],
      },
      order_items: {
        data: [
          { order_id: 'order-1', menu_item_id: 'menu-1', menu_item_name: 'Latte', quantity: 2, price: 120 },
        ],
      },
    })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { days: 30, platformClient: client })

    expect(result.coverage.complete).toBe(true)
    expect(result.facts).toHaveLength(1)
    expect(result.facts[0]).toMatchObject({
      backend: 'platform_supabase',
      externalOrderId: 'order-1',
      netTotal: 250,
      items: [expect.objectContaining({ menuItemId: 'menu-1', quantity: 2 })],
    })
    expect(calls[0]).toMatchObject({ table: 'orders' })
    expect(calls[0].filters).toContainEqual(['eq', 'tenant_id', 'tenant-1'])
  })

  it('reads the platform-side ledger for a Convex tenant, scoped to that backend', async () => {
    const { client, calls } = fakeClient({
      customer_external_orders: {
        data: [
          {
            backend: 'convex',
            external_order_id: 'convex-1',
            customer_id: 'customer-a',
            source: 'online',
            status: 'delivered',
            payment_status: 'paid',
            outlet_id: null,
            total: 250,
            ordered_at: '2026-09-01T02:00:00.000Z',
            completed_at: '2026-09-01T03:00:00.000Z',
            updated_at: '2026-09-01T03:00:00.000Z',
            items: [{ name: 'Latte', quantity: 2 }],
          },
        ],
      },
    })

    const result = await fetchCustomerOrderFacts(CONVEX_TENANT, { days: 30, platformClient: client })

    expect(result.facts).toHaveLength(1)
    expect(result.facts[0].backend).toBe('convex')
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toMatch(/anonymous/i)
    expect(calls[0]).toMatchObject({ table: 'customer_external_orders' })
    expect(calls[0].filters).toContainEqual(['eq', 'tenant_id', 'tenant-1'])
    expect(calls[0].filters).toContainEqual(['eq', 'backend', 'convex'])
  })

  it('reports an unreachable database as a coverage note, never as zero sales', async () => {
    const { client } = fakeClient({ orders: { error: { message: 'connection refused' } } })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { days: 30, platformClient: client })

    expect(result.facts).toEqual([])
    expect(result.coverage.complete).toBe(false)
    expect(result.coverage.note).toContain('connection refused')
  })

  it('refuses to answer at all when no platform client was supplied', async () => {
    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { days: 30 })

    expect(result.facts).toEqual([])
    expect(result.coverage.complete).toBe(false)
  })

  it('narrows to one branch when an outlet is given', async () => {
    const { client, calls } = fakeClient({ orders: { data: [] } })

    await fetchCustomerOrderFacts(PLATFORM_TENANT, {
      days: 30,
      outletId: 'outlet-9',
      platformClient: client,
    })

    expect(calls[0].filters).toContainEqual(['eq', 'outlet_id', 'outlet-9'])
  })

  it('reads beyond the first page rather than silently dropping older visits', async () => {
    const many = Array.from({ length: 1001 }, (_, index) => ({
      id: `order-${index}`,
      customer_id: 'customer-a',
      customer_contact: null,
      status: 'delivered',
      payment_status: 'paid',
      outlet_id: null,
      total: 10,
      created_at: '2026-09-01T02:00:00.000Z',
      updated_at: '2026-09-01T03:00:00.000Z',
      source: 'web',
    }))
    const { client } = fakeClient({ orders: { data: many }, order_items: { data: [] } })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { days: 30, platformClient: client })

    expect(result.facts).toHaveLength(1001)
    expect(result.coverage.complete).toBe(true)
  })

  it('reads item chunks through at most eight lanes while preserving every order and item', async () => {
    jest.useFakeTimers()
    try {
      const orders = manyOrders(3000)
      let active = 0
      let peak = 0
      const { client, requests } = delayedTables({
        orders,
        order_items: orders.map(order => ({
          order_id: order.id, menu_item_id: order.id, menu_item_name: 'Latte', quantity: 1, price: 10,
        })),
      }, async table => {
        if (table !== 'order_items') return
        active++
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 20))
        active--
      })
      const pending = fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

      await jest.advanceTimersByTimeAsync(200)
      const result = await pending
      expect(peak).toBe(8)
      // 150 order ids per request keeps the URL bounded: 3000 orders = 20 reads.
      expect(requests.filter(call => call.table === 'order_items')).toHaveLength(20)
      expect(result.coverage.complete).toBe(true)
      expect(result.facts).toHaveLength(3000)
      for (const fact of result.facts) {
        expect(fact.items).toEqual([expect.objectContaining({ menuItemId: fact.externalOrderId })])
      }
    } finally {
      jest.useRealTimers()
    }
  })

  it('reads order pages side by side once the first page comes back full', async () => {
    jest.useFakeTimers()
    try {
      let active = 0
      let peak = 0
      const { client, requests } = delayedTables({ orders: manyOrders(4500), order_items: [] }, async table => {
        if (table !== 'orders') return
        active++
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 20))
        active--
      })
      const pending = fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

      await jest.advanceTimersByTimeAsync(200)
      const result = await pending
      expect(peak).toBeGreaterThan(1)
      expect(requests.filter(call => call.table === 'orders').every(call => call.returned <= 1000)).toBe(true)
      expect(new Set(result.facts.map(fact => fact.externalOrderId)).size).toBe(4500)
    } finally {
      jest.useRealTimers()
    }
  })

  it('neither loses nor doubles an order when a new one arrives mid-read', async () => {
    const orders = manyOrders(2500)
    let orderReads = 0
    const { client } = delayedTables({ orders, order_items: [] }, async table => {
      if (table !== 'orders') return
      orderReads++
      if (orderReads === 2) {
        orders.push({ ...manyOrders(1)[0], id: 'order-new', created_at: '2026-12-31T00:00:00.000Z' })
      }
    })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

    const ids = result.facts.map(fact => fact.externalOrderId)
    expect(new Set(ids).size).toBe(ids.length)
    for (let index = 0; index < 2500; index++) expect(ids).toContain(`order-${index}`)
  })

  it('returns the newest order first', async () => {
    const { client } = delayedTables({ orders: manyOrders(1500), order_items: [] })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

    const times = result.facts.map(fact => fact.orderedAt)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('keeps order totals and stops starting item reads when one fails', async () => {
    const { client, requests } = delayedTables(
      { orders: manyOrders(3000), order_items: [] },
      undefined,
      { order_items: 'item database unavailable' },
    )

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

    expect(result.facts).toHaveLength(3000)
    expect(result.facts.every(fact => fact.netTotal === 10 && fact.items.length === 0)).toBe(true)
    expect(result.coverage).toEqual({
      complete: false,
      note: expect.stringContaining('item database unavailable'),
    })
    expect(requests.filter(call => call.table === 'order_items').length).toBeLessThanOrEqual(8)
  })

  it('paginates line items within an order chunk', async () => {
    const { client, calls } = fakeClient({
      orders: { data: [{
        id: 'large-order', customer_id: 'customer-a', status: 'delivered',
        total: 6000, created_at: '2026-09-01T02:00:00.000Z', source: 'web',
      }] },
      order_items: { data: Array.from({ length: 1600 }, (_, index) => ({
        order_id: 'large-order', menu_item_id: `menu-${index}`,
        menu_item_name: `Dish ${index}`, quantity: 1, price: 10,
      })) },
    })

    const result = await fetchCustomerOrderFacts(PLATFORM_TENANT, { ...LIFETIME, platformClient: client })

    expect(result.facts[0].items).toHaveLength(1600)
    expect(result.coverage.complete).toBe(true)
    expect(calls.filter(call => call.table === 'order_items')).toHaveLength(2)
  })
})
