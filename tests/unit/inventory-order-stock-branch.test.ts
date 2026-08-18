/**
 * Phase 2 of multi-branch inventory — an order depletes the branch that took it.
 *
 * Phase 1 gave stock a location (`inventory_stock`, one row per item per
 * branch) but changed no observable behaviour: `applyOrderStockMovements` still
 * carried no outlet, so every movement landed in the unbranched store pool.
 * A two-branch store therefore still shared one pile of flour in practice.
 *
 * Two rules are pinned here.
 *
 * 1. **Depletion follows the order's branch.** Orders already carry one.
 * 2. **A reversal returns stock to the branch it left**, read from the recorded
 *    movements rather than re-resolved from the order. Those can disagree — an
 *    order's branch can be corrected after the fact — and re-resolving would
 *    credit stock to a branch that never held it while leaving the branch that
 *    actually spent it permanently short.
 */

import {
  applyOrderStockMovements,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'

const TENANT = '44444444-4444-4444-8444-444444444444'
const ORDER = 'ord-branch-1'
const NORTH = 'outlet-north'
const SOUTH = 'outlet-south'
const FLOUR = 'item-flour'
const GRAM = 'unit-gram'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

jest.mock('@/lib/inventory/stock-alerts-service', () => ({
  processStockLevelChanges: jest.fn(() =>
    Promise.resolve({
      alertsRaised: 0,
      alertsResolved: 0,
      menuItemsDisabled: [],
      menuItemsReEnabled: [],
    }),
  ),
}))

const RECIPES = [
  { id: 'rec-1', tenant_id: TENANT, menu_item_id: 'menu-1', target_type: 'menu_item', target_id: null },
]
const COMPONENTS = [
  { id: 'cmp-1', tenant_id: TENANT, recipe_id: 'rec-1', inventory_item_id: FLOUR, unit_id: GRAM, quantity: 100 },
]
const ITEMS = [
  { id: FLOUR, tenant_id: TENANT, name: 'Flour', stock_unit_id: GRAM, current_qty: 1000, reorder_level: 0, is_active: true },
]
const UNITS = [
  { id: GRAM, tenant_id: TENANT, name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
]

/** Rows the code under test tried to write to the ledger. */
type Captured = Record<string, unknown>[]

/**
 * Supabase stub dispatching by table, capturing ledger inserts.
 *
 * `movements` seeds what `stock_movements` returns to a reversal; the depletion
 * path never reads that table, so one stub serves both directions.
 */
function stubDepletion(captured: Captured, movements: unknown[] = []) {
  const dataFor = (table: string): unknown[] => {
    if (table === 'recipes') return RECIPES
    if (table === 'recipe_components') return COMPONENTS
    if (table === 'inventory_items') return ITEMS
    if (table === 'inventory_units') return UNITS
    if (table === 'stock_movements') return movements
    return []
  }

  return (table: string) => {
    if (table === 'order_stock_applications') {
      // Both directions now list the order's claims: the sale checks for a
      // blocking void, the reverse picks its void revision.
      const claimChain = {
        eq: () => claimChain,
        then: (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null }),
      }
      return {
        select: () => claimChain,
        insert: () => Promise.resolve({ data: null, error: null }),
        delete: () => ({
          eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        }),
      }
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => Promise.resolve({ data: dataFor(table), error: null }),
      then: (resolve: (r: unknown) => unknown) =>
        resolve({ data: dataFor(table), error: null }),
      insert: (rows: unknown[]) => {
        captured.push(...(rows as Record<string, unknown>[]))
        return Promise.resolve({ data: null, error: null })
      },
    }
    return chain
  }
}

const ORDER_ITEMS = [
  { menuItemId: 'menu-1', quantity: 2, optionIds: [], modifierOptionIds: [], addonIds: [] },
]

beforeEach(() => {
  from.mockReset()
})

describe('depletion follows the order to its branch', () => {
  it('stamps the branch that took the order onto every ledger row', async () => {
    // Arrange
    const captured: Captured = []
    from.mockImplementation(stubDepletion(captured))

    // Act
    const result = await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0, NORTH)

    // Assert
    expect(result.movementCount).toBe(1)
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({
      inventory_item_id: FLOUR,
      outlet_id: NORTH,
      quantity_delta: -200,
    })
  })

  it('leaves the branch unset for a store with no branches', async () => {
    // Arrange — a single-location tenant stamps no branch on its orders, and
    // its stock lives in the unbranched pool. Inventing a branch here would
    // strand every existing tenant's stock in a location nothing reads.
    const captured: Captured = []
    from.mockImplementation(stubDepletion(captured))

    // Act
    await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale')

    // Assert
    expect(captured[0]).toMatchObject({ outlet_id: null })
  })

  it('reads a blank branch as the store pool rather than a branch named ""', async () => {
    // Arrange
    const captured: Captured = []
    from.mockImplementation(stubDepletion(captured))

    // Act
    await applyOrderStockMovements(TENANT, ORDER, ORDER_ITEMS, 'sale', 0, '   ')

    // Assert
    expect(captured[0]).toMatchObject({ outlet_id: null })
  })
})

describe('a reversal returns stock to the branch it left', () => {
  it('credits the branch recorded on the sale, not the order', async () => {
    // Arrange — the sale happened at North.
    const captured: Captured = []
    from.mockImplementation(
      stubDepletion(captured, [
        {
          inventory_item_id: FLOUR,
          outlet_id: NORTH,
          quantity_delta: -200,
          entered_quantity: 200,
          entered_unit_id: GRAM,
        },
      ]),
    )

    // Act
    await reverseOrderStockMovements(TENANT, ORDER)

    // Assert
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({
      outlet_id: NORTH,
      quantity_delta: 200,
      reason: 'void',
    })
  })

  it('keeps two branches apart instead of netting them into one row', async () => {
    // Arrange — the same ingredient spent at both branches. Netting on
    // (item, unit) alone would collapse these into a single -300 reversal with
    // no branch, taking 300g out of the store pool and giving neither branch
    // its stock back.
    const captured: Captured = []
    from.mockImplementation(
      stubDepletion(captured, [
        {
          inventory_item_id: FLOUR,
          outlet_id: NORTH,
          quantity_delta: -200,
          entered_quantity: 200,
          entered_unit_id: GRAM,
        },
        {
          inventory_item_id: FLOUR,
          outlet_id: SOUTH,
          quantity_delta: -100,
          entered_quantity: 100,
          entered_unit_id: GRAM,
        },
      ]),
    )

    // Act
    await reverseOrderStockMovements(TENANT, ORDER)

    // Assert
    expect(captured).toHaveLength(2)
    const byOutlet = Object.fromEntries(
      captured.map((row) => [row.outlet_id as string, row.quantity_delta]),
    )
    expect(byOutlet).toEqual({ [NORTH]: 200, [SOUTH]: 100 })
  })

  it('still nets two movements at the SAME branch into one row', async () => {
    // Arrange — a base recipe and an addon both spending flour at North.
    const captured: Captured = []
    from.mockImplementation(
      stubDepletion(captured, [
        {
          inventory_item_id: FLOUR,
          outlet_id: NORTH,
          quantity_delta: -200,
          entered_quantity: 200,
          entered_unit_id: GRAM,
        },
        {
          inventory_item_id: FLOUR,
          outlet_id: NORTH,
          quantity_delta: -50,
          entered_quantity: 50,
          entered_unit_id: GRAM,
        },
      ]),
    )

    // Act
    await reverseOrderStockMovements(TENANT, ORDER)

    // Assert
    expect(captured).toHaveLength(1)
    expect(captured[0]).toMatchObject({ outlet_id: NORTH, quantity_delta: 250 })
  })

  it('reverses an unbranched sale back into the store pool', async () => {
    // Arrange — every movement written before Phase 2 carries no branch.
    const captured: Captured = []
    from.mockImplementation(
      stubDepletion(captured, [
        {
          inventory_item_id: FLOUR,
          outlet_id: null,
          quantity_delta: -200,
          entered_quantity: 200,
          entered_unit_id: GRAM,
        },
      ]),
    )

    // Act
    await reverseOrderStockMovements(TENANT, ORDER)

    // Assert
    expect(captured[0]).toMatchObject({ outlet_id: null, quantity_delta: 200 })
  })
})
