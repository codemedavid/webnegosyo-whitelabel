/**
 * REPRODUCTION — "inventory is deducted twice" (2026-10-04 report).
 *
 * Drives the REAL order-stock service against a small stateful database fake:
 * claims persist and the unique index on (tenant, order, reason, revision)
 * refuses a second insert, and ledger rows persist so a scenario's NET stock
 * can be measured. Every scenario sells one order of 2 × menu-1, whose recipe
 * is 100 g of flour, so a correct ledger nets to exactly −200 g.
 *
 * The controls pass: a retried sale, a cancel, a cancel→un-cancel round trip
 * and an order edit all net to 1×. The defect was un-cancel: it re-deducted at
 * a fresh revision without checking that the cancellation ever put the stock
 * back, so any un-cancel the shelf never saw a restore for spent it twice.
 * Fixed 2026-10-06 by `isLatestSaleReversed`; these now guard the regression.
 */

import {
  applyOrderStockMovements,
  applyOrderRevisionStockBestEffort,
  redepleteOrderStockBestEffort,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'

const TENANT = '55555555-5555-4555-8555-555555555555'
const ORDER = 'ord-double-1'
const FLOUR = 'item-flour'
const GRAM = 'unit-gram'
const ONE_ORDER_OF_FLOUR = -200

type Row = Record<string, unknown>

interface FakeDb {
  order_stock_applications: Row[]
  stock_movements: Row[]
}

const db: FakeDb = { order_stock_applications: [], stock_movements: [] }

const STATIC_TABLES: Record<string, Row[]> = {
  recipes: [{ id: 'rec-1', tenant_id: TENANT, menu_item_id: 'menu-1', target_type: 'menu_item' }],
  recipe_components: [
    { id: 'cmp-1', tenant_id: TENANT, recipe_id: 'rec-1', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 100 },
  ],
  inventory_items: [
    { id: FLOUR, tenant_id: TENANT, name: 'Flour', stock_unit_id: GRAM, current_qty: 1000, reorder_level: 0, is_active: true },
  ],
  inventory_units: [
    { id: GRAM, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
  ],
  order_items: [{ menu_item_id: 'menu-1', quantity: 2 }],
  orders: [{ id: ORDER, tenant_id: TENANT, outlet_id: null, customer_data: null }],
  simple_option_stock_applications: [],
}

/** A chainable query over one table that honours eq/in filters. */
function query(table: string) {
  const filters: Array<(row: Row) => boolean> = []
  const rows = (): Row[] => {
    const source = (db as unknown as Record<string, Row[]>)[table] ?? STATIC_TABLES[table] ?? []
    return source.filter((row) => filters.every((keep) => keep(row)))
  }
  const result = () => Promise.resolve({ data: rows(), error: null })

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push((row) => !(column in row) || row[column] === value)
      return chain
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => !(column in row) || values.includes(row[column]))
      return chain
    },
    limit: result,
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      result().then(resolve, reject),
    insert: (input: Row | Row[]) => {
      const inserted = Array.isArray(input) ? input : [input]
      if (table === 'order_stock_applications') {
        const [claim] = inserted
        const taken = db.order_stock_applications.some(
          (row) =>
            row.tenant_id === claim.tenant_id &&
            row.order_id === claim.order_id &&
            row.reason === claim.reason &&
            row.revision === claim.revision,
        )
        if (taken) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      const target = (db as unknown as Record<string, Row[]>)[table]
      if (target) target.push(...inserted)
      return Promise.resolve({ data: null, error: null })
    },
    delete: () => {
      const del: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return del
        },
        then: (resolve: (r: unknown) => unknown) => {
          const target = (db as unknown as Record<string, Row[]>)[table]
          if (target) {
            const doomed = new Set(rows())
            const kept = target.filter((row) => !doomed.has(row))
            target.splice(0, target.length, ...kept)
          }
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return del
    },
  }
  return chain
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => query(table), rpc: async () => ({ data: 0, error: null }) }),
}))

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() =>
    Promise.resolve({ alertsRaised: 0, alertsResolved: 0, menuItemsDisabled: [], menuItemsReEnabled: [] }),
  ),
}))

const ORDER_LINES = [{ menuItemId: 'menu-1', quantity: 2, optionIds: [], addonIds: [] }]

/** Net flour movement for the order, as the ledger records it. */
function netFlour(): number {
  return db.stock_movements
    .filter((row) => row.order_id === ORDER && row.inventory_item_id === FLOUR)
    .reduce((sum, row) => sum + Number(row.quantity_delta), 0)
}

beforeEach(() => {
  db.order_stock_applications.length = 0
  db.stock_movements.length = 0
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('controls — paths that must NOT double-deduct', () => {
  it('a retried sale (double tap, network retry) is refused by the claim', async () => {
    await applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0)
    const retry = await applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0)

    expect(retry.outcome).toBe('duplicate')
    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })

  it('two sales racing in parallel still deduct once', async () => {
    await Promise.all([
      applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0),
      applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0),
    ])

    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })

  it('sale → cancel → un-cancel nets to exactly one order', async () => {
    await applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })

  it('an edit that adds a line deducts only the added line', async () => {
    // 1 × menu-1 sold, then the edit takes it to 2 × — the diff is +1.
    await applyOrderStockMovements(TENANT, ORDER, [{ ...ORDER_LINES[0], quantity: 1 }], 'sale', 0)
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, [{ ...ORDER_LINES[0], quantity: 1 }], [])

    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })
})

describe('REGRESSION — un-cancel re-deducts only stock that came back', () => {
  it('un-cancelling an order whose cancel never restored deducts it twice', async () => {
    // Arrange — sold, then cancelled on a path that did not restore (the
    // restore is best-effort: a timeout, an app build without the call, or a
    // cancel made outside updateOrderStatus). The shelf is still −200 g.
    await applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0)
    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)

    // Act — an admin flips the order back to an active status.
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert — the order is live once, so the shelf should be −200 g.
    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })

  it('a second un-cancel request (stale status read) deducts it again', async () => {
    // Arrange — sold and properly cancelled.
    await applyOrderStockMovements(TENANT, ORDER, ORDER_LINES, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)

    // Act — two staff (or one double tap) un-cancel. updateOrderStatus reads
    // the previous status BEFORE its update, so both requests saw
    // 'cancelled' and both call the re-depletion, one after the other.
    await redepleteOrderStockBestEffort(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert — one live order, one deduction.
    expect(netFlour()).toBe(ONE_ORDER_OF_FLOUR)
  })
})
