/**
 * Phase 1 — reading one day of the ledger for the report.
 *
 * Deliberately uses the RLS server client, not the service role. The WRITE side
 * of inventory needs service role because depletion runs behind a customer
 * order with no admin session; the READ side has an admin sitting in front of it
 * and must not bypass RLS. Same split `stock-alerts-read.ts` already makes.
 *
 * The tenant filter is asserted here rather than assumed. The subsystem review
 * found that across roughly fifty inventory suites exactly one checks a tenant
 * filter argument, because the shared Supabase stubs record calls and discard
 * their arguments — so deleting `.eq('tenant_id', …)` leaves the suites green.
 */

import { getDailyInventoryReport } from '@/lib/inventory/daily-report-read'

const TENANT = 'tenant-1'

interface Recorded {
  filters: Array<[string, unknown]>
  ranges: Array<[string, unknown]>
}

const recorded: Record<string, Recorded> = {}
const tableData: Record<string, unknown[]> = {}

const from = jest.fn((table: string) => {
  recorded[table] ??= { filters: [], ranges: [] }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      recorded[table].filters.push([column, value])
      return chain
    },
    gte: (column: string, value: unknown) => {
      recorded[table].ranges.push([`gte:${column}`, value])
      return chain
    },
    lt: (column: string, value: unknown) => {
      recorded[table].ranges.push([`lt:${column}`, value])
      return chain
    },
    order: () => chain,
    limit: () => chain,
    is: (column: string, value: unknown) => {
      recorded[table].filters.push([column, value])
      return chain
    },
    maybeSingle: () =>
      Promise.resolve({ data: (tableData[table] ?? [])[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: tableData[table] ?? [], error: null }),
  }
  return chain
})

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...(a as [string])) }),
}))

// The service-role client must never be reachable from this path. Importing it
// would be the mistake; this makes the mistake loud instead of silent.
const createAdminClient = jest.fn(() => {
  throw new Error('The read side must not use the service-role client')
})
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClient(),
}))

beforeEach(() => {
  from.mockClear()
  createAdminClient.mockClear()
  for (const key of Object.keys(recorded)) delete recorded[key]
  for (const key of Object.keys(tableData)) delete tableData[key]

  tableData.inventory_units = [
    { id: 'unit-g', abbreviation: 'g' },
  ]
  tableData.inventory_items = [
    { id: 'flour', name: 'Flour', unit_cost: 0.05, stock_unit_id: 'unit-g' },
  ]
  tableData.stock_movements = [
    {
      inventory_item_id: 'flour',
      reason: 'sale',
      quantity_delta: -200,
      balance_after: 800,
      created_at: '2026-07-29T05:00:00.000Z',
    },
  ]
})

describe('getDailyInventoryReport', () => {
  test('scopes every read to the tenant', async () => {
    // Act
    await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert — a missing filter here leaks another shop's costs and shrinkage,
    // and RLS is the only thing left standing between them.
    expect(recorded.stock_movements.filters).toContainEqual(['tenant_id', TENANT])
    expect(recorded.inventory_items.filters).toContainEqual(['tenant_id', TENANT])
    expect(recorded.inventory_units.filters).toContainEqual(['tenant_id', TENANT])
  })

  test('bounds the ledger read to the Manila day, half-open', async () => {
    // Act
    await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert — >= start and < end, so a movement is never counted twice.
    expect(recorded.stock_movements.ranges).toContainEqual([
      'gte:created_at',
      '2026-07-28T16:00:00.000Z',
    ])
    expect(recorded.stock_movements.ranges).toContainEqual([
      'lt:created_at',
      '2026-07-29T16:00:00.000Z',
    ])
  })

  test('never reaches for the service-role client', async () => {
    // Act
    await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  test('returns the reconciled report for the day', async () => {
    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert — 200 g of flour at ₱0.05/g.
    expect(report.dayKey).toBe('2026-07-29')
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({ name: 'Flour', sold: 200 })
    expect(report.totals.cogs).toBeCloseTo(10, 8)
  })

  test('resolves each ingredient stock unit so quantities carry their unit', async () => {
    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert — "200" alone is unreadable; "200 g" is a quantity.
    expect(report.rows[0].stockUnitAbbreviation).toBe('g')
  })

  test('reports a quiet day as empty rather than failing', async () => {
    // Arrange
    tableData.stock_movements = []

    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(report.rows).toEqual([])
    expect(report.totals.cogs).toBe(0)
  })
})

/**
 * The half of the report that says how much of it to believe.
 *
 * Without the session, an ingredient nobody looked at and an ingredient that
 * reconciled perfectly produce the identical row — so a count abandoned at the
 * fourth shelf reads as a spotless store.
 */
describe('the count session behind the day', () => {
  /** A closed count of 4 ingredients that only reached flour. */
  function stubPartialCount() {
    tableData.inventory_counts = [
      {
        id: 'count-1',
        tenant_id: TENANT,
        business_day: '2026-07-29',
        status: 'closed',
        expected_item_count: 4,
        closed_at: '2026-07-29T14:00:00.000Z',
      },
    ]
    tableData.stock_movements = [
      {
        inventory_item_id: 'flour',
        reason: 'stocktake',
        quantity_delta: -20,
        balance_after: 780,
        created_at: '2026-07-29T05:00:00.000Z',
        inventory_count_id: 'count-1',
      },
    ]
  }

  test('reports how far the day’s count actually got', async () => {
    // Arrange
    stubPartialCount()

    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(report.countSession?.state).toBe('partial')
    expect(report.countSession?.countedCount).toBe(1)
    expect(report.countSession?.expectedCount).toBe(4)
  })

  test('counts a recounted ingredient once', async () => {
    // Arrange — the same sack weighed three times because the number looked
    // wrong. Reading that as three ingredients would let one stubborn sack
    // report a finished count.
    stubPartialCount()
    tableData.stock_movements = [
      ...(tableData.stock_movements as unknown[]),
      {
        inventory_item_id: 'flour',
        reason: 'stocktake',
        quantity_delta: -1,
        balance_after: 779,
        created_at: '2026-07-29T05:05:00.000Z',
        inventory_count_id: 'count-1',
      },
    ]

    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(report.countSession?.countedCount).toBe(1)
  })

  test('ignores a stocktake that belonged to no session', async () => {
    // Arrange — a one-off correction during a count is not part of the count,
    // and crediting it would raise coverage for an ingredient nobody counted.
    stubPartialCount()
    tableData.stock_movements = [
      ...(tableData.stock_movements as unknown[]),
      {
        inventory_item_id: 'sugar',
        reason: 'stocktake',
        quantity_delta: -5,
        balance_after: 100,
        created_at: '2026-07-29T05:10:00.000Z',
        inventory_count_id: null,
      },
    ]

    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(report.countSession?.countedCount).toBe(1)
  })

  test('says nothing about a day nobody counted', async () => {
    // Arrange — every day before sessions existed, and every tenant who counts
    // without opening one. Inventing an abandoned count from an absent session
    // would accuse a merchant of a count they never started.
    tableData.inventory_counts = []

    // Act
    const report = await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert
    expect(report.countSession).toBeNull()
  })

  test('scopes the session read to the tenant and the day', async () => {
    // Arrange
    stubPartialCount()

    // Act
    await getDailyInventoryReport(TENANT, '2026-07-29')

    // Assert — a missing tenant filter here names another shop's count as this
    // shop's evidence.
    expect(recorded.inventory_counts.filters).toContainEqual(['tenant_id', TENANT])
    expect(recorded.inventory_counts.filters).toContainEqual(['business_day', '2026-07-29'])
  })
})

describe('getDailyInventoryReport — one branch of the store', () => {
  test('narrows the ledger to the branch', async () => {
    // `balance_after` has been per-branch since 20260808120000 and the
    // reconciliation already groups by branch; what it could not do was answer
    // for one branch alone, which is a branch admin's entire screen.
    await getDailyInventoryReport(TENANT, '2026-08-01', 'north')

    expect(recorded.stock_movements.filters).toContainEqual(['outlet_id', 'north'])
  })

  test("narrows the day's count session to the same branch", async () => {
    // Otherwise coverage is measured against a count opened for another shelf,
    // or against the store pool's, whose denominator counts ingredients this
    // branch never stocks.
    await getDailyInventoryReport(TENANT, '2026-08-01', 'north')

    expect(recorded.inventory_counts.filters).toContainEqual(['outlet_id', 'north'])
  })

  test('reads the whole store when no branch is named', async () => {
    // The owner's report is the default and must not acquire a branch filter by
    // accident: silently narrowed, they would see a fraction of their own stock
    // with nothing on screen to say so.
    await getDailyInventoryReport(TENANT, '2026-08-01')

    const branchFilters = recorded.stock_movements.filters.filter(
      ([column]) => column === 'outlet_id',
    )
    expect(branchFilters).toHaveLength(0)
  })
})
