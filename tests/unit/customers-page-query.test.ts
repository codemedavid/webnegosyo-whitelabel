import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * Reproducer for the Customers page crash:
 *
 *   TypeError: query.range is not a function
 *     at getCustomersPage (src/lib/customers-service.ts:380)
 *
 * A PostgREST query builder is THENABLE. `applyCustomerFilters` was declared
 * `async`, so `await applyCustomerFilters(query)` did not hand the builder back
 * — awaiting a promise that resolves to a thenable chains into it, which RUNS
 * the query and resolves to `{ data, error }`. Paging then called `.range()` on
 * a plain result object.
 *
 * The fake builder below is deliberately thenable for exactly this reason: a
 * non-thenable stub would pass against the broken code and prove nothing.
 */

interface FakeCustomerRow {
  id: string
  tenant_id: string
  name: string
  phone_e164: string | null
}

const ROWS: FakeCustomerRow[] = Array.from({ length: 7 }, (_, i) => ({
  id: `cust_${i + 1}`,
  tenant_id: 'tenant_1',
  name: `Customer ${i + 1}`,
  phone_e164: `+63917000000${i}`,
}))

/** Records how the service drove the builder, so tests can assert on it. */
interface QuerySpy {
  ranges: Array<[number, number]>
  orders: Array<{ column: string; ascending: boolean }>
  executions: number
}

function makeFakeSupabase(rows: FakeCustomerRow[], spy: QuerySpy) {
  function makeBuilder(isCount: boolean) {
    let range: [number, number] | null = null

    const builder = {
      eq: () => builder,
      ilike: () => builder,
      or: () => builder,
      order: (column: string, opts?: { ascending?: boolean }) => {
        spy.orders.push({ column, ascending: opts?.ascending ?? true })
        return builder
      },
      range: (from: number, to: number) => {
        spy.ranges.push([from, to])
        range = [from, to]
        return builder
      },
      // Thenable, exactly like a real PostgrestBuilder.
      then<TResult>(
        resolve: (value: unknown) => TResult,
        reject?: (reason: unknown) => TResult
      ) {
        spy.executions += 1
        const result = isCount
          ? { count: rows.length, error: null }
          : { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }

    return builder
  }

  return {
    from: () => ({
      select: (_columns: string, opts?: { head?: boolean }) => makeBuilder(Boolean(opts?.head)),
    }),
  }
}

let spy: QuerySpy
// Mutable so a test can vary the stored rows without re-mocking the module —
// re-mocking mid-file leaks the replacement into every test that follows.
let currentRows: FakeCustomerRow[]

jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: jest.fn(async () => undefined),
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => makeFakeSupabase(currentRows, spy)),
}))

beforeEach(() => {
  spy = { ranges: [], orders: [], executions: 0 }
  currentRows = ROWS
})

describe('getCustomersPage — query construction', () => {

  it('returns the first page of customers instead of throwing', async () => {
    const { getCustomersPage } = await import('@/lib/customers-service')

    const result = await getCustomersPage('tenant_1', { page: 1, pageSize: 3 })

    expect(result.customers.map((c) => c.id)).toEqual(['cust_1', 'cust_2', 'cust_3'])
    expect(result.pagination.totalCount).toBe(7)
    expect(result.pagination.totalPages).toBe(3)
  })

  it('applies the page window as a range on the data query', async () => {
    const { getCustomersPage } = await import('@/lib/customers-service')

    await getCustomersPage('tenant_1', { page: 2, pageSize: 3 })

    expect(spy.ranges).toEqual([[3, 5]])
  })

  it('applies the requested sort column', async () => {
    const { getCustomersPage } = await import('@/lib/customers-service')

    await getCustomersPage('tenant_1', { page: 1, pageSize: 3, sort: 'top_spend' })

    expect(spy.orders).toContainEqual({ column: 'total_spent', ascending: false })
  })

  it('runs the count query and the data query exactly once each', async () => {
    const { getCustomersPage } = await import('@/lib/customers-service')

    await getCustomersPage('tenant_1', { page: 1, pageSize: 3 })

    expect(spy.executions).toBe(2)
  })

  it('does not run the data query when there are no matching customers', async () => {
    currentRows = []

    const { getCustomersPage } = await import('@/lib/customers-service')
    const result = await getCustomersPage('tenant_1', { page: 1 })

    expect(result.customers).toEqual([])
    expect(spy.executions).toBe(1)
  })
})

describe('getCustomersByTenant — query construction', () => {
  it('returns customers instead of throwing on the offset window', async () => {
    const { getCustomersByTenant } = await import('@/lib/customers-service')

    const customers = await getCustomersByTenant('tenant_1', { limit: 2, offset: 1 })

    expect(customers.map((c) => c.id)).toEqual(['cust_2', 'cust_3'])
    expect(spy.ranges).toEqual([[1, 2]])
  })
})
