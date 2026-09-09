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
function fakeClient(responses: Record<string, { data?: Row[]; error?: { message: string } }>) {
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
    builder.then = (resolve: (value: unknown) => unknown) => {
      const response = responses[table] ?? { data: [] }
      return Promise.resolve(page && response.data
        ? { ...response, data: response.data.slice(page[0], page[1] + 1) }
        : response).then(resolve)
    }

    return builder
  }

  return { client: { from } as never, calls }
}

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
})
