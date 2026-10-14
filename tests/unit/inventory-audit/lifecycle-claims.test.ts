/**
 * AUDIT — order lifecycle × stock claims (2026-10-13).
 *
 * Drives the REAL order-stock service against a stateful fake of the platform
 * tables (same shape as tests/unit/inventory-double-deduction-repro.test.ts):
 * claims persist and the unique (tenant, order, reason, revision) index refuses
 * a second insert; ledger rows persist so each scenario's NET stock is
 * measurable. menu-1's base recipe is 100 g flour; the "Large" modifier option
 * adds 50 g. A correct ledger always nets to what the order CURRENTLY holds.
 *
 * Each `BUG` case asserts the correct outcome and FAILS on main.
 */

import {
  applyOrderStockMovements,
  applyOrderStockBestEffort,
  applyOrderRevisionStockBestEffort,
  redepleteOrderStockBestEffort,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'

const TENANT = '55555555-5555-4555-8555-555555555555'
const ORDER = 'b0000000-0000-4000-8000-0000000000c1'
const FLOUR = 'item-flour'
const GRAM = 'unit-gram'

type Row = Record<string, unknown>

const db: Record<string, Row[]> = { order_stock_applications: [], stock_movements: [] }

/** Per-test mutable "static" tables. */
let tables: Record<string, Row[]> = {}
/** What the simple-option RPC answers; an error simulates "Insufficient stock". */
let rpcAnswer: { data: unknown; error: unknown } = { data: 0, error: null }

function baseTables(): Record<string, Row[]> {
  return {
    recipes: [
      { id: 'rec-base', tenant_id: TENANT, menu_item_id: 'menu-1', target_type: 'menu_item' },
      {
        id: 'rec-large', tenant_id: TENANT, menu_item_id: 'menu-1',
        target_type: 'modifier_option', modifier_option_id: 'opt-large',
      },
    ],
    recipe_components: [
      { id: 'c1', tenant_id: TENANT, recipe_id: 'rec-base', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 100 },
      { id: 'c2', tenant_id: TENANT, recipe_id: 'rec-large', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 50 },
    ],
    inventory_items: [
      { id: FLOUR, tenant_id: TENANT, name: 'Flour', stock_unit_id: GRAM, current_qty: 10000, reorder_level: 0, is_active: true },
    ],
    inventory_units: [
      { id: GRAM, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
    ],
    menu_items: [{ id: 'menu-1', tenant_id: TENANT, modifier_groups: [] }],
    order_items: [{ menu_item_id: 'menu-1', quantity: 2 }],
    // A register (POS) order: no `_inventory_selections` snapshot — live data
    // shows 0 of 4,381 POS orders since 2026-10-01 carry one.
    orders: [{ id: ORDER, tenant_id: TENANT, outlet_id: null, customer_data: null }],
    simple_option_stock_applications: [],
  }
}

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = []
  const rows = (): Row[] => {
    const source = db[table] ?? tables[table] ?? []
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
    then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject),
    insert: (input: Row | Row[]) => {
      const inserted = Array.isArray(input) ? input : [input]
      if (table === 'order_stock_applications') {
        inserted.forEach((row) => { row.kind = row.kind ?? 'order' })
        const [claim] = inserted
        const taken = db.order_stock_applications.some(
          (row) => row.tenant_id === claim.tenant_id && row.order_id === claim.order_id &&
            row.reason === claim.reason && row.kind === claim.kind && row.revision === claim.revision,
        )
        if (taken) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
      }
      if (db[table]) db[table].push(...inserted)
      return Promise.resolve({ data: null, error: null })
    },
    update: (patch: Row) => {
      const upd: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return upd
        },
        then: (resolve: (r: unknown) => unknown) => {
          rows().forEach((row) => Object.assign(row, patch))
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return upd
    },
    delete: () => {
      const del: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value)
          return del
        },
        then: (resolve: (r: unknown) => unknown) => {
          const target = db[table]
          if (target) {
            const doomed = new Set(rows())
            target.splice(0, target.length, ...target.filter((row) => !doomed.has(row)))
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
  createAdminClient: () => ({ from: (table: string) => query(table), rpc: async () => rpcAnswer }),
}))
jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() => Promise.resolve({})),
}))
jest.mock('@/lib/inventory/stock-audit-service', () => ({
  recordStockAudit: jest.fn(() => Promise.resolve()),
  auditErrorDetail: (error: unknown) => String(error),
}))
jest.mock('@/lib/inventory/stock-failure-report', () => ({ reportStockFailure: jest.fn() }))

const TWO_PLAIN = [{ menuItemId: 'menu-1', quantity: 2, optionIds: [], addonIds: [] }]
const ONE_PLAIN = [{ menuItemId: 'menu-1', quantity: 1, optionIds: [], addonIds: [] }]

function netFlour(): number {
  return db.stock_movements
    .filter((row) => row.order_id === ORDER && row.inventory_item_id === FLOUR)
    .reduce((sum, row) => sum + Number(row.quantity_delta), 0)
}

beforeEach(() => {
  db.order_stock_applications.length = 0
  db.stock_movements.length = 0
  tables = baseTables()
  rpcAnswer = { data: 0, error: null }
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('controls (expected to pass)', () => {
  it('sale → cancel → un-cancel → cancel nets to zero', async () => {
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)
    await reverseOrderStockMovements(TENANT, ORDER)
    expect(netFlour()).toBe(0)
  })

  it('a double cancel restores once', async () => {
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    const second = await reverseOrderStockMovements(TENANT, ORDER)
    expect(second.outcome).not.toBe('applied')
    expect(netFlour()).toBe(0)
  })

  it('a cancel that lands before the (late) sale leaves the cancelled order at zero', async () => {
    await reverseOrderStockMovements(TENANT, ORDER)
    const late = await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    expect(late.outcome).toBe('cancelled_first')
    expect(netFlour()).toBe(0)
  })
})

describe('BUG — an EDIT void is treated as a cancellation', () => {
  it('an edit restore that lands before the original sale makes the late sale stand down, inventing stock', async () => {
    // Arrange — 2× sold, edited down to 1× (restore 1× at revision 1). The
    // edit's stock call reaches the server before the original sale's does
    // (POS sale bookkeeping still in flight / retried later).
    tables.order_items = [{ menu_item_id: 'menu-1', quantity: 1 }]
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, [], ONE_PLAIN)

    // Act — the original sale finally arrives.
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)

    // Assert — the live order holds 1× → −100 g. Main: +100 g (the edit
    // returned stock that was never taken; the sale was refused as
    // `cancelled_first` because hasBlockingVoidClaim counts the edit's void).
    expect(netFlour()).toBe(-100)
  })

  it('un-cancel after a cancel that never restored deducts twice when the order was edited', async () => {
    // Arrange — 2× sold, edited down to 1×, then cancelled on a path whose
    // restore never ran (best-effort timeout / app restore POST lost).
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, [], ONE_PLAIN)
    tables.order_items = [{ menu_item_id: 'menu-1', quantity: 1 }]
    expect(netFlour()).toBe(-100)

    // Act — admin flips it back to an active status.
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert — one live 1× order → −100 g. Main: −200 g, because
    // isLatestSaleReversed reads the edit's void@1 as "the sale was put back".
    expect(netFlour()).toBe(-100)
  })
})

describe('BUG — edit revisions and re-depletion revisions share one claim namespace', () => {
  it('the first edit after an un-cancel is refused as a duplicate and its added line never deducts', async () => {
    // Arrange — sold, cancelled, un-cancelled: re-depletion claims sale@1.
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)
    expect(netFlour()).toBe(-200)

    // Act — the register edits the order (+1×). It numbers the edit
    // orders.revision_number + 1 = 1, which cancel/un-cancel never bumped.
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, ONE_PLAIN, [])

    // Assert — 3× live → −300 g. Main: −200 g (edit sale@1 = duplicate).
    expect(netFlour()).toBe(-300)
  })
})

describe('BUG — un-cancel recomputes from order_items, losing option/add-on recipes', () => {
  it('re-depleting a register order without a selection snapshot drops the option recipe', async () => {
    // Arrange — 2× menu-1 (Large) sold at the register: 2×(100 g + 50 g).
    const twoLarge = [{ menuItemId: 'menu-1', quantity: 2, optionIds: ['opt-large'], modifierOptionIds: ['opt-large'], addonIds: [] }]
    await applyOrderStockMovements(TENANT, ORDER, twoLarge, 'sale', 0)
    expect(netFlour()).toBe(-300)
    await reverseOrderStockMovements(TENANT, ORDER)

    // Act — un-cancel.
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert — the same order is live again → −300 g. Main: −200 g.
    expect(netFlour()).toBe(-300)
  })
})

describe('BUG — a refused add-on counter aborts the whole ingredient depletion', () => {
  it('an "Insufficient stock" from the simple-option RPC leaves every ingredient on the shelf', async () => {
    // Arrange — the register (no preflight) sells 2× with an option whose
    // simple counter is at 0; the RPC raises.
    rpcAnswer = { data: null, error: { code: 'P0001', message: 'Insufficient stock for Extra shot' } }
    const items = [{ menuItemId: 'menu-1', quantity: 2, optionIds: ['opt-shot'], addonIds: [] }]

    // Act
    await applyOrderStockBestEffort(TENANT, ORDER, items, 'sale', 0)

    // Assert — the dish was sold; its 200 g of flour left the shelf.
    // Main: 0 g — applySimpleOptionStock throws before the ingredient claim.
    expect(netFlour()).toBe(-200)
  })
})

describe('claim kinds — after the fix (2026-10-14)', () => {
  it('an edit arriving after the cancellation moves nothing (sale or return)', async () => {
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)

    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, ONE_PLAIN, [])
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 2, [], ONE_PLAIN)

    expect(netFlour()).toBe(0)
  })

  it('a cancellation records what it put back on its own claim', async () => {
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)

    const cancel = db.order_stock_applications.find((row) => row.reason === 'void')
    expect(cancel?.kind).toBe('order')
    expect(cancel?.restored).toEqual([
      expect.objectContaining({ inventory_item_id: FLOUR, quantity_delta: 200, entered_unit_id: GRAM }),
    ])
  })

  it('un-cancels a Convex order (no platform row) from the recorded restore', async () => {
    const convexOrder = 'jh7convexorder0001'
    const twoLarge = [{ menuItemId: 'menu-1', quantity: 2, optionIds: ['opt-large'], modifierOptionIds: ['opt-large'], addonIds: [] }]
    await applyOrderStockMovements(TENANT, convexOrder, twoLarge, 'sale', 0)
    await reverseOrderStockMovements(TENANT, convexOrder)

    await redepleteOrderStockBestEffort(TENANT, convexOrder)

    const net = db.stock_movements
      .filter((row) => row.order_id === convexOrder)
      .reduce((sum, row) => sum + Number(row.quantity_delta), 0)
    expect(net).toBe(-300)
  })

  it('a second un-cancel request deducts nothing more', async () => {
    const twoLarge = [{ menuItemId: 'menu-1', quantity: 2, optionIds: ['opt-large'], modifierOptionIds: ['opt-large'], addonIds: [] }]
    await applyOrderStockMovements(TENANT, ORDER, twoLarge, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)

    await redepleteOrderStockBestEffort(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    expect(netFlour()).toBe(-300)
  })

  it('un-cancel undoes a cancellation that took stock out, not only one that put it back', async () => {
    // Arrange — the order's net was POSITIVE (a +500 g correction filed on it),
    // so its cancellation took 300 g out.
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    db.stock_movements.push({
      tenant_id: TENANT, inventory_item_id: FLOUR, outlet_id: null, reason: 'void',
      quantity_delta: 500, entered_quantity: 500, entered_unit_id: GRAM, order_id: ORDER,
    })
    await reverseOrderStockMovements(TENANT, ORDER)
    expect(netFlour()).toBe(0)

    // Act
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Assert — back to where the live order stood.
    expect(netFlour()).toBe(300)
  })

  it('a cancellation from before the record falls back to the order lines', async () => {
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    db.order_stock_applications.forEach((row) => { delete row.restored })

    await redepleteOrderStockBestEffort(TENANT, ORDER)

    expect(netFlour()).toBe(-200)
  })
})

describe('re-opening an order that had nothing to spend', () => {
  it('a later edit still deducts (the un-cancel leaves a marker claim)', async () => {
    // Arrange — sold before the dish had a recipe: nothing spent, no sale claim.
    const recipes = tables.recipes
    const components = tables.recipe_components
    tables.recipes = []
    tables.recipe_components = []
    await applyOrderStockMovements(TENANT, ORDER, TWO_PLAIN, 'sale', 0)
    await reverseOrderStockMovements(TENANT, ORDER)
    await redepleteOrderStockBestEffort(TENANT, ORDER)

    // Act — the merchant adds the recipe, then the register adds 1× to the order.
    tables.recipes = recipes
    tables.recipe_components = components
    await applyOrderRevisionStockBestEffort(TENANT, ORDER, 1, ONE_PLAIN, [])

    // Assert
    expect(netFlour()).toBe(-100)
  })
})
