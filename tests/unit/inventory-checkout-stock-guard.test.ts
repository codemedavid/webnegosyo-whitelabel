/**
 * The checkout guard that finally uses the producible ceiling.
 *
 * `producible.ts` holds the arithmetic; this is the read that feeds it and the
 * one decision `createOrderAction` calls. It sits beside the Loyverse live
 * check in the same action, and answers the question that check never could:
 * not "is this dish above zero?" but "can the kitchen make the number in this
 * cart?".
 *
 * Three refusals are deliberate, all of them the same trade the rest of the
 * inventory system makes — a wrongly refused order costs a real sale, a
 * wrongly accepted one costs an apology:
 *   - inventory switched off → no opinion, ever
 *   - the read failed → no opinion (our outage must not close their shop)
 *   - a branch with no stock row for an ingredient → no opinion at that branch
 */

import { findCheckoutStockShortfallMessage } from '@/lib/inventory/checkout-stock-guard'

const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (...a: unknown[]) => from(...a) }),
}))

/** Chainable, thenable Supabase stub — mirrors inventory-stock-alerts-read. */
function table(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve({ data, error }),
    maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
    single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error }),
  }
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    chain[method] = () => chain
  }
  return chain
}

const GRAM = { id: 'unit-gram', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }

/** Pizza: 200 g of flour. Flour on hand: 1000 g store-wide → 5 pizzas. */
const RECIPE = { id: 'r-pizza', target_type: 'menu_item', menu_item_id: 'm-pizza' }
const COMPONENT = {
  recipe_id: 'r-pizza', inventory_item_id: 'ing-flour', quantity: 200, unit_id: 'unit-gram',
}
const FLOUR = {
  id: 'ing-flour', name: 'Flour', stock_unit_id: 'unit-gram', current_qty: 1000, is_active: true,
}
const MENU_ITEM = { id: 'm-pizza', name: 'Margherita' }

interface WireOptions {
  tenant?: unknown
  recipes?: unknown[]
  components?: unknown[]
  items?: unknown[]
  units?: unknown[]
  menuItems?: unknown[]
  branchStock?: unknown[]
  error?: unknown
}

function wire(options: WireOptions = {}) {
  const tables: Record<string, unknown> = {
    tenants: table(options.tenant ?? { inventory_enabled: true }, options.error),
    recipes: table(options.recipes ?? [RECIPE], options.error),
    recipe_components: table(options.components ?? [COMPONENT], options.error),
    inventory_items: table(options.items ?? [FLOUR], options.error),
    inventory_units: table(options.units ?? [GRAM], options.error),
    menu_items: table(options.menuItems ?? [MENU_ITEM], options.error),
    inventory_stock: table(options.branchStock ?? [], options.error),
  }
  from.mockImplementation((name: string) => tables[name] ?? table([]))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('findCheckoutStockShortfallMessage', () => {
  it('refuses a cart asking for more than the kitchen can make', async () => {
    // Arrange — flour for 5 pizzas, a cart of 50.
    wire()

    // Act
    const message = await findCheckoutStockShortfallMessage('t1', [
      { menuItemId: 'm-pizza', quantity: 50 },
    ])

    // Assert
    expect(message).toContain('Margherita')
    expect(message).toContain('5')
  })

  it('lets a cart through when the ingredients cover it', async () => {
    wire()

    const message = await findCheckoutStockShortfallMessage('t1', [
      { menuItemId: 'm-pizza', quantity: 5 },
    ])

    expect(message).toBe('')
  })

  it('has no opinion when the tenant has not turned inventory on', async () => {
    wire({ tenant: { inventory_enabled: false } })

    const message = await findCheckoutStockShortfallMessage('t1', [
      { menuItemId: 'm-pizza', quantity: 50 },
    ])

    expect(message).toBe('')
    // The recipe tables are never even read — an inventory-less tenant must
    // pay nothing for a feature they did not switch on.
    expect(from).not.toHaveBeenCalledWith('recipes')
  })

  it('has no opinion when the read fails — our outage cannot close their shop', async () => {
    wire({ error: { message: 'boom' } })

    const message = await findCheckoutStockShortfallMessage('t1', [
      { menuItemId: 'm-pizza', quantity: 50 },
    ])

    expect(message).toBe('')
  })

  it('has no opinion when the cart is empty', async () => {
    wire()

    expect(await findCheckoutStockShortfallMessage('t1', [])).toBe('')
    expect(from).not.toHaveBeenCalledWith('recipes')
  })

  it('judges a branch order against that branch’s own shelf, not the roll-up', async () => {
    // The store-wide roll-up says 1000 g (5 pizzas); this branch holds 400 g.
    wire({
      branchStock: [
        { inventory_item_id: 'ing-flour', outlet_id: 'branch-1', current_qty: 400 },
        { inventory_item_id: 'ing-flour', outlet_id: 'branch-2', current_qty: 600 },
      ],
    })

    const message = await findCheckoutStockShortfallMessage(
      't1',
      [{ menuItemId: 'm-pizza', quantity: 5 }],
      'branch-1',
    )

    expect(message).toContain('2')
  })

  it('passes over an ingredient the branch has no row for', async () => {
    // The branch is stocked, but not for flour — unjudgeable there, so the
    // sale goes through rather than being refused as if the shelf were empty.
    wire({
      branchStock: [
        { inventory_item_id: 'ing-yeast', outlet_id: 'branch-1', current_qty: 50 },
      ],
    })

    const message = await findCheckoutStockShortfallMessage(
      't1',
      [{ menuItemId: 'm-pizza', quantity: 50 }],
      'branch-1',
    )

    expect(message).toBe('')
  })

  it('uses the store-wide roll-up when the order names no branch', async () => {
    wire({
      branchStock: [
        { inventory_item_id: 'ing-flour', outlet_id: 'branch-1', current_qty: 400 },
      ],
    })

    const message = await findCheckoutStockShortfallMessage('t1', [
      { menuItemId: 'm-pizza', quantity: 5 },
    ])

    expect(message).toBe('')
  })
})
