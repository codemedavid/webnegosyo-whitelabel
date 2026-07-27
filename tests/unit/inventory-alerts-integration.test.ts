/**
 * Phase 7 — the whole chain, with nothing mocked but the database.
 *
 * Every other suite in this feature mocks at a module seam: the wiring tests
 * stub `processStockLevelChanges`, the service tests stub the depletion that
 * calls it. Both of Phase 7's bugs lived exactly in those seams and neither
 * suite could see them — a cancellation that never reached the alert path, and
 * an auto-86 whose recovery used a different threshold than its disable.
 *
 * So this one wires the real modules together — depletion, the ledger, the
 * level rules, auto-86 — and mocks only Supabase. It walks the journey a
 * merchant actually takes:
 *
 *   sell the last of the flour  → dish comes off the menu, alert raised
 *   cancel that order           → dish goes back on, alert resolved
 */

import {
  applyOrderStockMovements,
  reverseOrderStockMovements,
} from '@/lib/inventory/order-stock-service'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

/** Chainable, thenable Supabase stub that records what it was asked to write. */
function table(data: unknown) {
  const writes: { insert: unknown[][]; update: unknown[] } = { insert: [], update: [] }
  const chain: Record<string, unknown> = {
    writes,
    then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
    insert: (rows: unknown[]) => {
      writes.insert.push(rows)
      return chain
    },
    update: (payload: unknown) => {
      writes.update.push(payload)
      return chain
    },
  }
  for (const method of ['select', 'eq', 'is', 'not', 'in', 'single', 'limit']) {
    chain[method] = () => chain
  }
  return chain as Record<string, unknown> & { writes: typeof writes }
}

const GRAMS = {
  id: 'unit-g',
  tenant_id: 't1',
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
}

const BASE_RECIPE = {
  id: 'r-base',
  tenant_id: 't1',
  target_type: 'menu_item',
  menu_item_id: 'menu-carbonara',
}

const FLOUR_IN_RECIPE = {
  id: 'c1',
  tenant_id: 't1',
  recipe_id: 'r-base',
  inventory_item_id: 'flour',
  quantity: 10,
  unit_id: 'unit-g',
  sort_order: 0,
}

/** One ingredient, one dish, both alert features on. */
function wire(options: {
  flourQty: number
  openAlerts?: unknown[]
  recordedSales?: unknown[]
  alreadyRestored?: unknown[]
}) {
  const tables = {
    tenants: table({ low_stock_alerts_enabled: true, auto_86_enabled: true }),
    recipes: table([BASE_RECIPE]),
    recipe_components: table([FLOUR_IN_RECIPE]),
    inventory_items: table([
      {
        id: 'flour',
        tenant_id: 't1',
        name: 'Flour',
        current_qty: options.flourQty,
        reorder_level: 20,
        is_active: true,
        stock_unit_id: 'unit-g',
        unit_cost: 1,
        is_prep: false,
      },
    ]),
    inventory_units: table([GRAMS]),
    stock_alerts: table(options.openAlerts ?? []),
    menu_items: table([{ id: 'menu-carbonara' }]),
  }

  // Depletion reads `stock_movements` once (idempotency); restore reads it
  // twice (the sale it reverses, then its own already-ran guard).
  const movementAnswers = [options.recordedSales ?? [], options.alreadyRestored ?? []]
  let movementCall = 0
  const movements = table([])

  from.mockImplementation((name: string) => {
    if (name === 'stock_movements') {
      const answer = movementAnswers[movementCall++] ?? []
      const t = table(answer)
      // One shared write log, so the assertions do not care which read it was.
      t.writes.insert = movements.writes.insert
      return t
    }
    return tables[name as keyof typeof tables] ?? table([])
  })

  return { ...tables, stock_movements: movements }
}

beforeEach(() => {
  from.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('selling the last of an ingredient', () => {
  // 10 g on hand, the dish needs 10 g: this order empties the shelf.
  const LAST_PORTION = { flourQty: 10 }
  const ONE_DISH = [{ menuItemId: 'menu-carbonara', quantity: 1 }]

  it('records the depletion, raises an alert, and takes the dish off the menu', async () => {
    const tables = wire(LAST_PORTION)

    const result = await applyOrderStockMovements('t1', 'order-1', ONE_DISH, 'sale')

    // The ledger entry
    expect(result.movementCount).toBe(1)
    expect(tables.stock_movements.writes.insert[0]).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', quantity_delta: -10, reason: 'sale' }),
    ])

    // The alert — 'out', not 'low', because the shelf is empty
    expect(tables.stock_alerts.writes.insert[0]).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', level: 'out', quantity: 0 }),
    ])

    // The dish, hidden and stamped as the system's doing
    expect(tables.menu_items.writes.update[0]).toMatchObject({ is_available: false })
    expect(tables.menu_items.writes.update[0]).toHaveProperty('auto_disabled_at', expect.any(String))
  })

  it('leaves the menu alone when the sale only makes the ingredient low', async () => {
    // 100 g on hand, 10 g sold: below the reorder level of 20 is a warning, not
    // a reason to stop selling.
    const tables = wire({ flourQty: 25 })

    await applyOrderStockMovements('t1', 'order-1', ONE_DISH, 'sale')

    expect(tables.stock_alerts.writes.insert[0]).toEqual([
      expect.objectContaining({ level: 'low' }),
    ])
    expect(tables.menu_items.writes.update).toEqual([])
  })
})

describe('cancelling that order', () => {
  const THE_SALE = [
    {
      inventory_item_id: 'flour',
      quantity_delta: -10,
      entered_quantity: 10,
      entered_unit_id: 'unit-g',
    },
  ]

  it('gives the flour back and puts the dish on sale again, alert still open', async () => {
    const tables = wire({
      flourQty: 0, // as the sale left it
      recordedSales: THE_SALE,
      openAlerts: [{ id: 'alert-1', inventory_item_id: 'flour' }],
    })

    const result = await reverseOrderStockMovements('t1', 'order-1')

    // The reversal, exactly negating the sale
    expect(result.movementCount).toBe(1)
    expect(tables.stock_movements.writes.insert[0]).toEqual([
      expect.objectContaining({ inventory_item_id: 'flour', quantity_delta: 10, reason: 'void' }),
    ])

    // The alert stays OPEN: 10 g back on a 20 g reorder level is still low, and
    // the merchant still needs to reorder. Availability and the alert answer
    // different questions, and this cancellation only answered the first. But
    // it is corrected to say 'low', so the banner stops claiming "out of stock"
    // over a shelf with flour on it.
    expect(tables.stock_alerts.writes.update).toEqual([{ level: 'low', quantity: 10 }])

    // The dish is sellable again, and the marker is cleared so a merchant who
    // hides it later keeps it hidden.
    expect(tables.menu_items.writes.update[0]).toMatchObject({
      is_available: true,
      auto_disabled_at: null,
    })
  })

  it('does not touch the menu when the order was already restored', async () => {
    const tables = wire({
      flourQty: 0,
      recordedSales: THE_SALE,
      alreadyRestored: [{ id: 'mv-void' }],
    })

    const result = await reverseOrderStockMovements('t1', 'order-1')

    expect(result.movementCount).toBe(0)
    expect(tables.menu_items.writes.update).toEqual([])
  })
})
