import { describe, expect, it } from '@jest/globals'
import { fakeSupabaseTables } from '../../../fixtures/fake-supabase-tables'
import { queryOrdersTable, searchOrFilter } from '@/lib/admin/orders-table/read-orders-table'
import { DEFAULT_ORDERS_FILTERS, type OrdersTableFilters } from '@/lib/admin/orders-table/filters'
import { OUTLET_FILTER_UNASSIGNED } from '@/lib/outlets/order-outlet-display'
import type { BranchScope } from '@/lib/outlets/branch-scope'

const TENANT = 'tenant-1'
const WINDOW = { startIso: '2026-11-20T16:00:00.000Z', endIso: '2026-11-21T16:00:00.000Z' }
const ALL: BranchScope = { kind: 'all' }

let seq = 0
function order(overrides: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: `order-${String(seq).padStart(4, '0')}`,
    tenant_id: TENANT,
    status: 'pending',
    order_type: 'Pickup',
    outlet_id: null,
    payment_status: 'pending',
    payment_proof_uploaded_at: null,
    customer_name: 'Ana',
    // Spread across today so ordering is visible.
    created_at: new Date(Date.parse('2026-11-21T00:00:00.000Z') + seq * 1000).toISOString(),
    order_items: [],
    ...overrides,
  }
}

function run(rows: object[], filters: Partial<OrdersTableFilters> = {}, scope: BranchScope = ALL, window: typeof WINDOW | null = WINDOW) {
  const fake = fakeSupabaseTables({ orders: rows })
  return {
    fake,
    result: queryOrdersTable(fake.client as never, {
      tenantId: TENANT,
      scope,
      filters: { ...DEFAULT_ORDERS_FILTERS, ...filters },
      window,
      pageSize: 25,
    }),
  }
}

describe('queryOrdersTable', () => {
  it('pages in the query and reports the true total, past the 1000-row cap', async () => {
    const rows = Array.from({ length: 1210 }, () => order())
    const { result, fake } = run(rows, { page: 49 })
    const page = await result
    expect(page.totalCount).toBe(1210)
    expect(page.totalPages).toBe(49)
    expect(page.orders).toHaveLength(10)
    // Newest first: the last page holds the oldest orders.
    expect(page.orders[page.orders.length - 1].id).toBe(rows[0].id)
    const pageRead = fake.requests.find((r) => r.returned > 0)
    expect(pageRead).toMatchObject({ from: 1200, to: 1224 })
  })

  it('filters the status in the query, so an old order is still found', async () => {
    const rows = [order({ status: 'cancelled' }), ...Array.from({ length: 60 }, () => order())]
    const page = await run(rows, { status: 'cancelled' }).result
    expect(page.orders.map((o) => o.id)).toEqual([rows[0].id])
    expect(page.totalCount).toBe(1)
  })

  it('counts every status over the same filters, whatever tab is open', async () => {
    const rows = [
      order({ status: 'pending' }),
      order({ status: 'pending' }),
      order({ status: 'ready' }),
      order({ status: 'delivered', order_type: 'Delivery' }),
      order({ status: 'cancelled' }),
      order({ status: 'pending', tenant_id: 'other-store' }),
      order({ status: 'pending', created_at: '2026-11-19T00:00:00.000Z' }),
    ]
    const page = await run(rows, { status: 'ready', type: 'Pickup' }).result
    expect(page.counts).toEqual({
      pending: 2,
      confirmed: 0,
      preparing: 0,
      ready: 1,
      delivered: 0,
      cancelled: 1,
      all: 4,
    })
    expect(page.totalCount).toBe(1)
  })

  it('skips the counts for all time', async () => {
    const page = await run([order()], { range: 'all' }, ALL, null).result
    expect(page.counts).toBeNull()
    expect(page.totalCount).toBe(1)
  })

  it('keeps the page when a count read fails', async () => {
    const fake = fakeSupabaseTables({ orders: [order()] })
    let calls = 0
    const flaky = {
      from(table: string) {
        calls += 1
        // First read = the page; the 4th read is one of the counts.
        if (calls === 4) return fakeSupabaseTables({}, { [table]: 'timeout' }).client.from(table)
        return fake.client.from(table)
      },
    }
    const page = await queryOrdersTable(flaky as never, {
      tenantId: TENANT,
      scope: ALL,
      filters: DEFAULT_ORDERS_FILTERS,
      window: WINDOW,
    })
    expect(page.orders).toHaveLength(1)
    expect(page.counts).toBeNull()
  })

  it('narrows to a branch, or to orders with no branch', async () => {
    const rows = [order({ outlet_id: 'b-1' }), order({ outlet_id: 'b-2' }), order({ outlet_id: null })]
    expect((await run(rows, { branch: 'b-1' }).result).orders.map((o) => o.outlet_id)).toEqual(['b-1'])
    expect((await run(rows, { branch: OUTLET_FILTER_UNASSIGNED }).result).orders.map((o) => o.outlet_id)).toEqual([null])
  })

  it("never lets the address widen a branch account's view", async () => {
    const rows = [order({ outlet_id: 'b-1' }), order({ outlet_id: 'b-2' })]
    const page = await run(rows, { branch: 'b-2' }, { kind: 'branch', outletId: 'b-1' }).result
    expect(page.orders.map((o) => o.outlet_id)).toEqual(['b-1'])
    expect(page.counts?.all).toBe(1)
  })

  it('applies the payment filters by the same rules as the chips', async () => {
    const paid = order({ payment_status: 'paid', status: 'delivered' })
    const proof = order({ payment_proof_uploaded_at: '2026-11-21T01:00:00.000Z' })
    // Imported from Convex: a screenshot or reference, never stamped.
    const importedShot = order({ payment_proof_url: 'https://img.test/proof.png' })
    const importedRef = order({ payment_proof_reference: 'GC-123' })
    const owed = order({ status: 'ready', payment_proof_url: '', payment_proof_reference: null })
    const handedOver = order({ status: 'delivered' })
    const cancelled = order({ status: 'cancelled', payment_status: 'paid' })
    const rows = [paid, proof, importedShot, importedRef, owed, handedOver, cancelled]
    const ids = async (payment: OrdersTableFilters['payment']) => (await run(rows, { payment }).result).orders.map((o) => o.id).sort()
    expect(await ids('paid')).toEqual([paid.id])
    expect(await ids('proof')).toEqual([proof.id, importedShot.id, importedRef.id].sort())
    expect(await ids('unpaid')).toEqual([owed.id])
    // Each row's chip agrees with the filter that picked it.
    const { platformOrderRow } = await import('@/lib/admin/orders-table/row-model')
    for (const row of [proof, importedShot, importedRef]) expect(platformOrderRow(row as never).payment).toBe('proof')
    expect(platformOrderRow(owed as never).payment).toBe('unpaid')
  })

  it('answers a page past the end with an empty page and the true total, not an error', async () => {
    const rows = Array.from({ length: 30 }, () => order())
    const fake = fakeSupabaseTables({ orders: rows })
    let calls = 0
    const pastTheEnd = {
      from(table: string) {
        calls += 1
        const query = fake.client.from(table) as unknown as { select: (...args: unknown[]) => Record<string, unknown> }
        if (calls !== 1) return query
        // PostgREST refuses an offset past the last row with 416 / PGRST103.
        const select = query.select.bind(query)
        query.select = (...args: unknown[]) => {
          const builder = select(...args)
          builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve({ data: null, count: null, error: { message: 'Requested range not satisfiable', code: 'PGRST103' } }).then(resolve, reject)
          return builder
        }
        return query
      },
    }
    const page = await queryOrdersTable(pastTheEnd as never, {
      tenantId: TENANT,
      scope: ALL,
      filters: { ...DEFAULT_ORDERS_FILTERS, page: 3 },
      window: WINDOW,
      pageSize: 25,
    })
    expect(page.orders).toEqual([])
    expect(page.totalCount).toBe(30)
    expect(page.page).toBe(3)
    expect(page.totalPages).toBe(2)
  })
})

describe('searchOrFilter', () => {
  it('matches name or phone, and the daily number for a number', () => {
    expect(searchOrFilter('Ana')).toBe('customer_name.ilike."%Ana%",customer_contact.ilike."%Ana%"')
    expect(searchOrFilter('#12')).toBe('customer_name.ilike."%12%",customer_contact.ilike."%12%",daily_number.eq.12')
  })

  it('cannot add a clause of its own', () => {
    const filter = searchOrFilter('x",status.eq.cancelled,(a') ?? ''
    // The quote, comma and parentheses are gone; what is left sits inside our quotes.
    expect(filter).toBe('customer_name.ilike."%x status.eq.cancelled a%",customer_contact.ilike."%x status.eq.cancelled a%"')
  })

  it('asks nothing for an empty search', () => {
    expect(searchOrFilter('   ')).toBeNull()
    expect(searchOrFilter('(),')).toBeNull()
  })
})
