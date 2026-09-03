/**
 * How many of a dish the kitchen can actually make, and refusing a cart that
 * asks for more.
 *
 * Every stock guard the platform has today is BINARY and RETROSPECTIVE. Auto-86
 * pulls a dish once an ingredient has already hit zero, which means the order
 * that emptied the shelf was accepted in full: flour for two burgers accepts a
 * cart of fifty, and the merchant discovers it at the pass. Loyverse tenants get
 * `findOutOfStockLines`, but it too only asks "is this above zero?" — never "is
 * there enough for the quantity being bought?".
 *
 * This is the missing arithmetic. Pure, like `low-stock.ts` and `auto-86.ts`:
 * the decision is needed by the cart (to cap a stepper), by checkout (to refuse
 * an order), and by the admin (to show a ceiling), and a second opinion between
 * them would be a customer told "5 left" by one screen and refused by another.
 *
 * Two biases, both inherited from the existing depletion path:
 *   - Untracked means unlimited. A dish with no recipe, or a recipe naming an
 *     ingredient this tenant does not stock, must never block a sale — most
 *     menus are only partly costed and refusing good orders is the worse
 *     failure.
 *   - Only a POSITIVE shortage blocks, and only for ingredients that can be
 *     judged. Anything unknown, inactive, or unconvertible is passed over.
 */

import {
  resolveProducibleUnits,
  findCartStockShortfalls,
  describeStockShortfalls,
  type ProducibleStock,
} from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

const FLOUR = 'ing-flour'
const CHEESE = 'ing-cheese'

const GRAM: InventoryUnit = {
  id: 'unit-gram', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1,
}
const KILO: InventoryUnit = {
  id: 'unit-kilo', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000,
}
const PIECE: InventoryUnit = {
  id: 'unit-piece', name: 'Piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1,
}

/** The tenant's unit catalogue — component rows carry a unit id, not a unit. */
const UNITS: InventoryUnit[] = [GRAM, KILO, PIECE]

const recipe = (over: Partial<Recipe>): Recipe =>
  ({
    id: 'r1', tenant_id: 't1', target_type: 'menu_item', menu_item_id: 'm1',
    created_at: '', updated_at: '', ...over,
  }) as Recipe

const component = (over: Partial<RecipeComponent>): RecipeComponent =>
  ({
    id: 'c1', tenant_id: 't1', recipe_id: 'r-pizza', inventory_item_id: FLOUR,
    quantity: 200, unit_id: GRAM.id, sort_order: 0, created_at: '', ...over,
  }) as RecipeComponent

const stock = (over: Partial<ProducibleStock>): ProducibleStock => ({
  id: FLOUR, current_qty: 1000, is_active: true, stockUnit: GRAM, ...over,
})

/** Pizza: 200 g flour + 80 g cheese per unit. */
const PIZZA = recipe({ id: 'r-pizza', menu_item_id: 'm-pizza' })
const PIZZA_COMPONENTS = [
  component({ id: 'c1', inventory_item_id: FLOUR, quantity: 200 }),
  component({ id: 'c2', inventory_item_id: CHEESE, quantity: 80 }),
]

describe('resolveProducibleUnits', () => {
  it('returns the whole units the scarcest ingredient allows', () => {
    // Arrange — flour for 5, cheese for 10.
    const shelf = [
      stock({ id: FLOUR, current_qty: 1000 }),
      stock({ id: CHEESE, current_qty: 800 }),
    ]

    // Act
    const units = resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)

    // Assert
    expect(units).toBe(5)
  })

  it('floors a partial unit — half a pizza is not sellable', () => {
    const shelf = [
      stock({ id: FLOUR, current_qty: 950 }),
      stock({ id: CHEESE, current_qty: 800 }),
    ]

    expect(resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)).toBe(4)
  })

  it('is zero once an ingredient is exhausted', () => {
    const shelf = [
      stock({ id: FLOUR, current_qty: 0 }),
      stock({ id: CHEESE, current_qty: 800 }),
    ]

    expect(resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)).toBe(0)
  })

  it('converts recipe units into the unit the ingredient is stocked in', () => {
    // 2 kg of flour is 10 pizzas at 200 g each — not 0.
    const shelf = [
      stock({ id: FLOUR, current_qty: 2, stockUnit: KILO }),
      stock({ id: CHEESE, current_qty: 800 }),
    ]

    expect(resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)).toBe(10)
  })

  it('does not lose a whole unit to floating-point dust', () => {
    // 0.1 × 3 in binary floating point is 0.30000000000000004; naive division
    // and flooring would answer 2 and refuse a sale the kitchen can make.
    const tiny = recipe({ id: 'r-tea', menu_item_id: 'm-tea' })
    const leaves = component({ id: 'c-tea', recipe_id: 'r-tea', inventory_item_id: FLOUR, quantity: 0.1 })

    const units = resolveProducibleUnits(
      { menuItemId: 'm-tea' },
      [tiny],
      [leaves],
      [stock({ id: FLOUR, current_qty: 0.1 + 0.1 + 0.1 })],
      UNITS,
    )

    expect(units).toBe(3)
  })

  it('reports no ceiling for a dish with no base recipe', () => {
    expect(
      resolveProducibleUnits({ menuItemId: 'm-uncosted' }, [PIZZA], PIZZA_COMPONENTS, [stock({})], UNITS),
    ).toBeNull()
  })

  it('reports no ceiling for a recipe shell that lists no ingredients', () => {
    const empty = recipe({ id: 'r-empty', menu_item_id: 'm-empty' })

    expect(resolveProducibleUnits({ menuItemId: 'm-empty' }, [empty], [], [stock({})], UNITS)).toBeNull()
  })

  it('passes over an ingredient the tenant does not stock rather than blocking', () => {
    // Cheese has no row at all — unjudgeable, so flour alone sets the ceiling.
    const units = resolveProducibleUnits(
      { menuItemId: 'm-pizza' },
      [PIZZA],
      PIZZA_COMPONENTS,
      [stock({ id: FLOUR, current_qty: 1000 })],
      UNITS,
    )

    expect(units).toBe(5)
  })

  it('passes over an ingredient that is no longer tracked', () => {
    const shelf = [
      stock({ id: FLOUR, current_qty: 1000 }),
      stock({ id: CHEESE, current_qty: 0, is_active: false }),
    ]

    expect(resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)).toBe(5)
  })

  it('passes over a component whose unit cannot convert to the stock unit', () => {
    // Cheese stocked by the piece, the recipe measures it in grams: no density
    // is known, so this component is unjudgeable — it must not read as zero.
    const shelf = [
      stock({ id: FLOUR, current_qty: 1000 }),
      stock({ id: CHEESE, current_qty: 4, stockUnit: PIECE }),
    ]

    expect(resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], PIZZA_COMPONENTS, shelf, UNITS)).toBe(5)
  })

  it('passes over a component asking for nothing', () => {
    const zeroed = [component({ id: 'c1', inventory_item_id: FLOUR, quantity: 0 })]

    expect(
      resolveProducibleUnits({ menuItemId: 'm-pizza' }, [PIZZA], zeroed, [stock({ current_qty: 0 })], UNITS),
    ).toBeNull()
  })
})

describe('findCartStockShortfalls', () => {
  const shelfFor = (flour: number, cheese: number): ProducibleStock[] => [
    stock({ id: FLOUR, current_qty: flour }),
    stock({ id: CHEESE, current_qty: cheese }),
  ]

  it('says nothing when the cart is within what the kitchen can make', () => {
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'm-pizza', quantity: 5 }],
      [PIZZA],
      PIZZA_COMPONENTS,
      shelfFor(1000, 800),
      UNITS,
    )

    expect(shortfalls).toEqual([])
  })

  it('refuses a line asking for more than the ingredients allow', () => {
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'm-pizza', quantity: 50 }],
      [PIZZA],
      PIZZA_COMPONENTS,
      shelfFor(1000, 800),
      UNITS,
    )

    expect(shortfalls).toEqual([{ menuItemId: 'm-pizza', requested: 50, producible: 5 }])
  })

  it('spends shared stock once across lines instead of granting it twice', () => {
    // Both dishes are 200 g of flour. Flour for 5 total, and the cart asks for
    // 3 + 3 — each line passes alone, the cart as a whole does not.
    const calzone = recipe({ id: 'r-calzone', menu_item_id: 'm-calzone' })
    const calzoneComponents = [
      component({ id: 'c3', recipe_id: 'r-calzone', inventory_item_id: FLOUR, quantity: 200 }),
    ]

    const shortfalls = findCartStockShortfalls(
      [
        { menuItemId: 'm-pizza', quantity: 3 },
        { menuItemId: 'm-calzone', quantity: 3 },
      ],
      [PIZZA, calzone],
      [...PIZZA_COMPONENTS, ...calzoneComponents],
      shelfFor(1000, 800),
      UNITS,
    )

    // The first line is served in full; the second gets what is left.
    expect(shortfalls).toEqual([{ menuItemId: 'm-calzone', requested: 3, producible: 2 }])
  })

  it('never reports a dish that is not stock-tracked', () => {
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'm-uncosted', quantity: 99 }],
      [PIZZA],
      PIZZA_COMPONENTS,
      shelfFor(0, 0),
      UNITS,
    )

    expect(shortfalls).toEqual([])
  })

  it('ignores a line ordering nothing', () => {
    const shortfalls = findCartStockShortfalls(
      [{ menuItemId: 'm-pizza', quantity: 0 }],
      [PIZZA],
      PIZZA_COMPONENTS,
      shelfFor(0, 0),
      UNITS,
    )

    expect(shortfalls).toEqual([])
  })

  it('merges two lines of the same dish before judging it', () => {
    // 3 + 3 of one dish is 6 pizzas against flour for 5 — one shortfall
    // naming the dish once, not two lines that each look satisfiable.
    const shortfalls = findCartStockShortfalls(
      [
        { menuItemId: 'm-pizza', quantity: 3 },
        { menuItemId: 'm-pizza', quantity: 3 },
      ],
      [PIZZA],
      PIZZA_COMPONENTS,
      shelfFor(1000, 800),
      UNITS,
    )

    expect(shortfalls).toEqual([{ menuItemId: 'm-pizza', requested: 6, producible: 5 }])
  })
})

describe('describeStockShortfalls', () => {
  it('names the dish and how many are left', () => {
    const message = describeStockShortfalls(
      [{ menuItemId: 'm-pizza', requested: 50, producible: 5 }],
      new Map([['m-pizza', 'Margherita']]),
    )

    expect(message).toContain('Margherita')
    expect(message).toContain('5')
  })

  it('says sold out rather than "0 left"', () => {
    const message = describeStockShortfalls(
      [{ menuItemId: 'm-pizza', requested: 2, producible: 0 }],
      new Map([['m-pizza', 'Margherita']]),
    )

    expect(message).toMatch(/sold out/i)
    expect(message).not.toMatch(/\b0 left/i)
  })

  it('lists every dish that cannot be filled', () => {
    const message = describeStockShortfalls(
      [
        { menuItemId: 'm-pizza', requested: 50, producible: 5 },
        { menuItemId: 'm-calzone', requested: 3, producible: 0 },
      ],
      new Map([
        ['m-pizza', 'Margherita'],
        ['m-calzone', 'Calzone'],
      ]),
    )

    expect(message).toContain('Margherita')
    expect(message).toContain('Calzone')
  })

  it('falls back to a neutral noun when the dish name is unknown', () => {
    const message = describeStockShortfalls(
      [{ menuItemId: 'm-ghost', requested: 2, producible: 1 }],
      new Map(),
    )

    expect(message).not.toContain('m-ghost')
    expect(message.length).toBeGreaterThan(0)
  })

  it('is empty when nothing is short', () => {
    expect(describeStockShortfalls([], new Map())).toBe('')
  })
})
