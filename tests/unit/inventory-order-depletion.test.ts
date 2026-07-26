/**
 * Phase 4B — spending stock when an order is placed.
 *
 * `resolveConfiguredRecipeIds` has existed since Phase 0 with no caller; this is
 * the consumer it was built for. Given an order's lines, work out how much of
 * each ingredient leaves the shelf.
 *
 * A discovered constraint shapes this: order items carry `variation` as a
 * comma-joined *display string* ("Large, Extra Spicy") and addons as names.
 * No option or addon ids reach the order. Deriving database keys by splitting a
 * display string would corrupt stock the moment an option name contains a
 * comma — so option/addon depletion is accepted as input here but nothing
 * supplies it yet. Under-depleting is the safe direction; mis-depleting is not.
 */

import { resolveOrderDepletions } from '@/lib/inventory/order-depletion'
import type { Recipe, RecipeComponent } from '@/types/database'

const FLOUR = 'ing-flour'
const CHEESE = 'ing-cheese'
const GRAM = 'unit-gram'

const recipe = (over: Partial<Recipe>): Recipe =>
  ({
    id: 'r1', tenant_id: 't1', target_type: 'menu_item', menu_item_id: 'm1',
    created_at: '', updated_at: '', ...over,
  }) as Recipe

const component = (over: Partial<RecipeComponent>): RecipeComponent =>
  ({
    id: 'c1', tenant_id: 't1', recipe_id: 'r1', inventory_item_id: FLOUR,
    quantity: 100, unit_id: GRAM, sort_order: 0, created_at: '', ...over,
  }) as RecipeComponent

const PIZZA_RECIPE = recipe({ id: 'r-pizza', menu_item_id: 'm-pizza' })
const PIZZA_LINES = [
  component({ id: 'c1', recipe_id: 'r-pizza', inventory_item_id: FLOUR, quantity: 200 }),
  component({ id: 'c2', recipe_id: 'r-pizza', inventory_item_id: CHEESE, quantity: 80 }),
]

describe('resolveOrderDepletions', () => {
  it('spends an item’s base recipe when it is ordered', () => {
    // Arrange / Act
    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-pizza', quantity: 1 }],
      [PIZZA_RECIPE],
      PIZZA_LINES,
    )

    // Assert
    expect(depletions).toEqual(
      expect.arrayContaining([
        { inventoryItemId: FLOUR, quantity: 200, unitId: GRAM },
        { inventoryItemId: CHEESE, quantity: 80, unitId: GRAM },
      ]),
    )
  })

  it('multiplies by how many were ordered', () => {
    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-pizza', quantity: 3 }],
      [PIZZA_RECIPE],
      PIZZA_LINES,
    )

    expect(depletions).toContainEqual({ inventoryItemId: FLOUR, quantity: 600, unitId: GRAM })
  })

  it('merges the same ingredient across separate order lines', () => {
    // Two lines of the same pizza must produce one movement of 400g, not two of
    // 200g — a ledger row per line would make the history unreadable.
    const depletions = resolveOrderDepletions(
      [
        { menuItemId: 'm-pizza', quantity: 1 },
        { menuItemId: 'm-pizza', quantity: 1 },
      ],
      [PIZZA_RECIPE],
      PIZZA_LINES,
    )

    const flour = depletions.filter((d) => d.inventoryItemId === FLOUR)
    expect(flour).toEqual([{ inventoryItemId: FLOUR, quantity: 400, unitId: GRAM }])
  })

  it('keeps the same ingredient separate when recipes measure it differently', () => {
    // 200g of flour and 1kg of flour cannot be summed here — conversion belongs
    // to the ledger, which knows the item's stock unit.
    const KILO = 'unit-kilo'
    const breadRecipe = recipe({ id: 'r-bread', menu_item_id: 'm-bread' })
    const breadLines = [
      component({ id: 'c3', recipe_id: 'r-bread', inventory_item_id: FLOUR, quantity: 1, unit_id: KILO }),
    ]

    const depletions = resolveOrderDepletions(
      [
        { menuItemId: 'm-pizza', quantity: 1 },
        { menuItemId: 'm-bread', quantity: 1 },
      ],
      [PIZZA_RECIPE, breadRecipe],
      [...PIZZA_LINES, ...breadLines],
    )

    expect(depletions).toContainEqual({ inventoryItemId: FLOUR, quantity: 200, unitId: GRAM })
    expect(depletions).toContainEqual({ inventoryItemId: FLOUR, quantity: 1, unitId: KILO })
  })

  it('ignores an item that has no recipe instead of throwing', () => {
    // Most menus are only partly costed. An uncosted item must not break the
    // order — it simply spends nothing.
    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-unknown', quantity: 2 }],
      [PIZZA_RECIPE],
      PIZZA_LINES,
    )

    expect(depletions).toEqual([])
  })

  it('spends the recipes of selected options and addons when ids are supplied', () => {
    // Nothing passes these yet (see the file header), but the capability is
    // here so wiring ids through the order payload is a change of one caller.
    const optionRecipe = recipe({
      id: 'r-large', menu_item_id: 'm-pizza',
      target_type: 'modifier_option', modifier_option_id: 'opt-large',
    })
    const optionLines = [
      component({ id: 'c4', recipe_id: 'r-large', inventory_item_id: CHEESE, quantity: 40 }),
    ]

    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-pizza', quantity: 1, modifierOptionIds: ['opt-large'] }],
      [PIZZA_RECIPE, optionRecipe],
      [...PIZZA_LINES, ...optionLines],
    )

    // 80g base + 40g for the upgrade, merged into one movement.
    expect(depletions).toContainEqual({ inventoryItemId: CHEESE, quantity: 120, unitId: GRAM })
  })

  it('does not spend an option recipe that was not selected', () => {
    const optionRecipe = recipe({
      id: 'r-large', menu_item_id: 'm-pizza',
      target_type: 'modifier_option', modifier_option_id: 'opt-large',
    })
    const optionLines = [
      component({ id: 'c4', recipe_id: 'r-large', inventory_item_id: CHEESE, quantity: 40 }),
    ]

    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-pizza', quantity: 1 }],
      [PIZZA_RECIPE, optionRecipe],
      [...PIZZA_LINES, ...optionLines],
    )

    expect(depletions).toContainEqual({ inventoryItemId: CHEESE, quantity: 80, unitId: GRAM })
  })

  it('returns nothing for an empty order', () => {
    expect(resolveOrderDepletions([], [PIZZA_RECIPE], PIZZA_LINES)).toEqual([])
  })

  it('skips a zero-quantity line rather than writing an empty movement', () => {
    const depletions = resolveOrderDepletions(
      [{ menuItemId: 'm-pizza', quantity: 0 }],
      [PIZZA_RECIPE],
      PIZZA_LINES,
    )

    expect(depletions).toEqual([])
  })
})
