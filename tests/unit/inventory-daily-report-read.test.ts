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
