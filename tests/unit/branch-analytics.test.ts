import { groupOrdersByOutlet, compareBranches } from '@/lib/outlets/branch-analytics'

/**
 * Cross-branch comparison for the owner — the original ask behind this feature.
 *
 * Two properties matter more than any individual figure:
 *
 * 1. **Nothing is dropped.** Orders taken before branches existed, and orders
 *    from paths that never stamped one, carry no branch. Silently discarding
 *    them would make the comparison add up to less than the store's own
 *    revenue, and the owner would have no way to tell which. They get an
 *    explicit `Unassigned` row instead.
 * 2. **The parts equal the whole.** Revenue and order count summed across every
 *    row — Unassigned included — must equal the store total. This is the check
 *    that catches a double-count or a dropped bucket.
 *
 * Cancelled orders are excluded from revenue and count, matching what the
 * dashboard and the Convex stats handler already do, so the branch table and
 * the store's own figures describe the same set of orders.
 */

const CANCELLED = 'cancelled'

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    total: 100,
    status: 'completed',
    created_at: '2026-07-29T10:00:00Z',
    ...overrides,
  }
}

function north(overrides: Record<string, unknown> = {}) {
  return order({
    outlet_id: 'outlet-north',
    customer_data: { outlet_id: 'outlet-north', outlet_name: 'North Branch' },
    ...overrides,
  })
}

function south(overrides: Record<string, unknown> = {}) {
  return order({
    outlet_id: 'outlet-south',
    customer_data: { outlet_id: 'outlet-south', outlet_name: 'South Branch' },
    ...overrides,
  })
}

describe('groupOrdersByOutlet', () => {
  it('puts each order under the branch that took it', () => {
    const groups = groupOrdersByOutlet([north({ id: 'a' }), south({ id: 'b' }), north({ id: 'c' })])

    expect(groups.map((g) => g.outletId)).toEqual(['outlet-north', 'outlet-south'])
    expect(groups[0].orders.map((o) => o.id)).toEqual(['a', 'c'])
  })

  it('names each branch from the snapshot on its own orders', () => {
    const groups = groupOrdersByOutlet([north()])

    expect(groups[0].outletName).toBe('North Branch')
  })

  it('collects unattributed orders into an explicit Unassigned row', () => {
    const groups = groupOrdersByOutlet([north(), order({ id: 'legacy' })])

    const unassigned = groups.find((g) => g.outletId === null)
    expect(unassigned).toBeDefined()
    expect(unassigned?.outletName).toBe('Unassigned')
    expect(unassigned?.orders.map((o) => o.id)).toEqual(['legacy'])
  })

  it('omits the Unassigned row entirely when every order carries a branch', () => {
    // A merchant who has always been multi-branch should not be shown an empty
    // row inviting them to wonder what is in it.
    const groups = groupOrdersByOutlet([north(), south()])

    expect(groups.some((g) => g.outletId === null)).toBe(false)
  })

  it('falls back to the branch id when no name was ever recorded', () => {
    // Better a row the owner can match against their branch list than a blank.
    const groups = groupOrdersByOutlet([order({ outlet_id: 'outlet-ghost' })])

    expect(groups[0].outletName).toBe('outlet-ghost')
  })

  it('returns nothing for an empty order list', () => {
    expect(groupOrdersByOutlet([])).toEqual([])
  })
})

describe('compareBranches', () => {
  it('reports revenue, order count and average per branch', () => {
    const rows = compareBranches([
      north({ id: 'a', total: 100 }),
      north({ id: 'b', total: 300 }),
      south({ id: 'c', total: 50 }),
    ])

    const northRow = rows.find((r) => r.outletId === 'outlet-north')
    expect(northRow).toMatchObject({ revenue: 400, orderCount: 2, averageOrderValue: 200 })
    expect(rows.find((r) => r.outletId === 'outlet-south')).toMatchObject({
      revenue: 50,
      orderCount: 1,
      averageOrderValue: 50,
    })
  })

  it('excludes cancelled orders from revenue and count', () => {
    const rows = compareBranches([
      north({ id: 'a', total: 100 }),
      north({ id: 'b', total: 900, status: CANCELLED }),
    ])

    expect(rows[0]).toMatchObject({ revenue: 100, orderCount: 1 })
  })

  it('reports a zero average rather than dividing by zero', () => {
    const rows = compareBranches([north({ status: CANCELLED })])

    expect(rows[0].averageOrderValue).toBe(0)
  })

  it('ranks branches by revenue, highest first', () => {
    const rows = compareBranches([north({ total: 10 }), south({ total: 500 })])

    expect(rows.map((r) => r.outletId)).toEqual(['outlet-south', 'outlet-north'])
  })

  it('keeps Unassigned last however much revenue it holds', () => {
    // It is a data-quality bucket, not a branch competing in the ranking.
    const rows = compareBranches([north({ total: 10 }), order({ id: 'legacy', total: 9999 })])

    expect(rows[rows.length - 1].outletId).toBeNull()
  })

  it('sums to the store total across every row including Unassigned', () => {
    const orders = [
      north({ id: 'a', total: 100 }),
      south({ id: 'b', total: 250 }),
      order({ id: 'legacy', total: 75 }),
      north({ id: 'cancelled', total: 999, status: CANCELLED }),
    ]

    const rows = compareBranches(orders)
    const storeTotal = orders
      .filter((o) => o.status !== CANCELLED)
      .reduce((sum, o) => sum + o.total, 0)

    expect(rows.reduce((sum, r) => sum + r.revenue, 0)).toBe(storeTotal)
    expect(rows.reduce((sum, r) => sum + r.orderCount, 0)).toBe(3)
  })

  it('counts the share of store revenue each branch holds', () => {
    const rows = compareBranches([north({ total: 750 }), south({ total: 250 })])

    expect(rows[0].revenueShare).toBeCloseTo(0.75)
    expect(rows[1].revenueShare).toBeCloseTo(0.25)
  })

  it('reports a zero share rather than NaN when the store took nothing', () => {
    const rows = compareBranches([north({ total: 0 })])

    expect(rows[0].revenueShare).toBe(0)
  })

  it('treats a missing total as zero rather than producing NaN revenue', () => {
    // Convex and tenant-owned rows are untyped; one bad row must not turn the
    // whole comparison into NaN.
    const rows = compareBranches([north({ total: undefined })])

    expect(rows[0].revenue).toBe(0)
  })

  it('returns nothing for an empty order list', () => {
    expect(compareBranches([])).toEqual([])
  })
})
