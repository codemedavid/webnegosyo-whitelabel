import {
  scopeOrdersQuery,
  assertOrderInScope,
  scopeOrderRows,
} from '@/lib/outlets/branch-scope-query'

/**
 * Applying an account's branch to an actual orders query.
 *
 * The filter belongs in the database query, not in the page that renders the
 * result: a branch account must never receive another branch's rows, not even
 * to discard them client-side. Pagination is the concrete reason — a
 * client-side filter would return a "page" of 20 rows with 3 visible, and the
 * total count would describe a store the account cannot see.
 */

interface Call {
  column: string
  value: unknown
}

function makeQuery() {
  const calls: Call[] = []
  const query = {
    calls,
    eq(column: string, value: unknown) {
      calls.push({ column, value })
      return this
    },
  }
  return query
}

describe('scopeOrdersQuery', () => {
  it('adds no filter for an all-branch account', () => {
    const query = makeQuery()

    const result = scopeOrdersQuery(query, { kind: 'all' })

    expect(query.calls).toEqual([])
    expect(result).toBe(query)
  })

  it('filters to the account own branch', () => {
    const query = makeQuery()

    scopeOrdersQuery(query, { kind: 'branch', outletId: 'outlet-north' })

    expect(query.calls).toEqual([{ column: 'outlet_id', value: 'outlet-north' }])
  })

  it('returns the query so it can be chained', () => {
    const query = makeQuery()

    const result = scopeOrdersQuery(query, { kind: 'branch', outletId: 'outlet-north' })

    expect(result).toBe(query)
  })
})

describe('assertOrderInScope', () => {
  const north = { kind: 'branch', outletId: 'outlet-north' } as const

  it('passes an order from the account own branch', () => {
    expect(() => assertOrderInScope({ outlet_id: 'outlet-north' }, north)).not.toThrow()
  })

  it('passes anything for an all-branch account', () => {
    expect(() => assertOrderInScope({ outlet_id: 'outlet-south' }, { kind: 'all' })).not.toThrow()
  })

  it("refuses another branch's order", () => {
    expect(() => assertOrderInScope({ outlet_id: 'outlet-south' }, north)).toThrow(/not found/i)
  })

  it('refuses an unattributed order', () => {
    expect(() => assertOrderInScope({ outlet_id: null }, north)).toThrow(/not found/i)
  })

  it('says "not found" rather than "forbidden", so the id is not confirmed', () => {
    // A distinct "forbidden" would tell a branch account which order ids exist
    // at the other branches.
    expect(() => assertOrderInScope({ outlet_id: 'outlet-south' }, north)).toThrow(
      'Order not found'
    )
  })
})

describe('scopeOrderRows', () => {
  const rows = [
    { id: '1', outlet_id: 'outlet-north' },
    { id: '2', outlet_id: 'outlet-south' },
    { id: '3', customer_data: { outlet_id: 'outlet-north' } },
  ]

  it('returns every row for an all-branch account', () => {
    expect(scopeOrderRows(rows, { kind: 'all' })).toBe(rows)
  })

  it('keeps only the account own branch, including the customer_data carrier', () => {
    const result = scopeOrderRows(rows, { kind: 'branch', outletId: 'outlet-north' })

    expect(result.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('tolerates an empty list', () => {
    expect(scopeOrderRows([], { kind: 'branch', outletId: 'outlet-north' })).toEqual([])
  })
})
