/**
 * "Why is this dish off my menu?"
 *
 * `auto_disabled_at` records that the system hid a dish, and the badge shipped
 * earlier says so. Neither says WHICH ingredient did it, so a merchant seeing
 * "Out of stock" on Carbonara has to open every recipe and cross-check every
 * shelf by hand to find the one empty jar.
 *
 * This is the inverse of `resolveMenuItemsToDisable`: that maps empty
 * ingredients to doomed dishes, this maps a hidden dish back to the ingredients
 * holding it down.
 */

import { explainAutoHiddenDishes } from '@/lib/inventory/auto-86-blame'
import type { MenuItem, Recipe, RecipeComponent } from '@/types/database'
import type { StockLevelInput } from '@/lib/inventory/low-stock'

function menuItem(over: Partial<MenuItem> & { id: string; name: string }): MenuItem {
  return {
    is_available: false,
    auto_disabled_at: '2026-07-27T10:42:00Z',
    ...over,
  } as MenuItem
}

function ingredient(over: Partial<StockLevelInput> & { id: string; name: string }): StockLevelInput {
  return { current_qty: 0, reorder_level: 10, is_active: true, ...over }
}

const CARBONARA = menuItem({ id: 'm1', name: 'Carbonara' })
const BASE_RECIPE = { id: 'r1', target_type: 'menu_item', menu_item_id: 'm1' } as Recipe
const USES_MOZZARELLA = { recipe_id: 'r1', inventory_item_id: 'moz' } as RecipeComponent

describe('explaining an auto-hidden dish', () => {
  it('names the empty ingredient that took the dish off the menu', () => {
    const result = explainAutoHiddenDishes(
      [CARBONARA],
      [BASE_RECIPE],
      [USES_MOZZARELLA],
      [ingredient({ id: 'moz', name: 'Mozzarella', current_qty: 0 })],
    )

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Carbonara')
    expect(result[0].blockingIngredients.map((i) => i.name)).toEqual(['Mozzarella'])
    expect(result[0].hiddenAt).toBe('2026-07-27T10:42:00Z')
  })

  it('names every empty ingredient, not just the first', () => {
    const result = explainAutoHiddenDishes(
      [CARBONARA],
      [BASE_RECIPE],
      [USES_MOZZARELLA, { recipe_id: 'r1', inventory_item_id: 'egg' } as RecipeComponent],
      [
        ingredient({ id: 'moz', name: 'Mozzarella', current_qty: 0 }),
        ingredient({ id: 'egg', name: 'Egg', current_qty: 0 }),
      ],
    )

    // Restocking only one of them will not bring the dish back, so showing only
    // one would send the merchant on a second trip to the supplier.
    expect(result[0].blockingIngredients.map((i) => i.name).sort()).toEqual(['Egg', 'Mozzarella'])
  })

  it('leaves the in-stock ingredients of the same recipe out of the blame', () => {
    const result = explainAutoHiddenDishes(
      [CARBONARA],
      [BASE_RECIPE],
      [USES_MOZZARELLA, { recipe_id: 'r1', inventory_item_id: 'pasta' } as RecipeComponent],
      [
        ingredient({ id: 'moz', name: 'Mozzarella', current_qty: 0 }),
        ingredient({ id: 'pasta', name: 'Pasta', current_qty: 500 }),
      ],
    )

    expect(result[0].blockingIngredients.map((i) => i.name)).toEqual(['Mozzarella'])
  })

  it('reports a dish whose ingredients are all back as blocked by nothing', () => {
    // The recovery path should have put this back. That it did not is exactly
    // the kind of stuck state a merchant currently cannot see at all.
    const result = explainAutoHiddenDishes(
      [CARBONARA],
      [BASE_RECIPE],
      [USES_MOZZARELLA],
      [ingredient({ id: 'moz', name: 'Mozzarella', current_qty: 500 })],
    )

    expect(result).toHaveLength(1)
    expect(result[0].blockingIngredients).toEqual([])
  })
})

describe('what does not count as auto-hidden', () => {
  it('ignores a dish the merchant hid themselves', () => {
    // No ownership marker means a person made this choice, and telling them the
    // system did it would be a lie about their own menu.
    const manual = menuItem({ id: 'm1', name: 'Carbonara', auto_disabled_at: null })

    expect(
      explainAutoHiddenDishes(
        [manual],
        [BASE_RECIPE],
        [USES_MOZZARELLA],
        [ingredient({ id: 'moz', name: 'Mozzarella' })],
      ),
    ).toEqual([])
  })

  it('ignores a dish that is on sale, marker or not', () => {
    const live = menuItem({ id: 'm1', name: 'Carbonara', is_available: true })

    expect(
      explainAutoHiddenDishes(
        [live],
        [BASE_RECIPE],
        [USES_MOZZARELLA],
        [ingredient({ id: 'moz', name: 'Mozzarella' })],
      ),
    ).toEqual([])
  })

  it('does not blame an ingredient reached only through an addon recipe', () => {
    // Same rule auto-86 itself enforces: only a base recipe can hide a dish, so
    // only a base recipe may be blamed for it.
    const addonRecipe = { id: 'r2', target_type: 'addon', addon_id: 'a1' } as Recipe

    const result = explainAutoHiddenDishes(
      [CARBONARA],
      [BASE_RECIPE, addonRecipe],
      [USES_MOZZARELLA, { recipe_id: 'r2', inventory_item_id: 'truffle' } as RecipeComponent],
      [
        ingredient({ id: 'moz', name: 'Mozzarella', current_qty: 500 }),
        ingredient({ id: 'truffle', name: 'Truffle Oil', current_qty: 0 }),
      ],
    )

    expect(result[0].blockingIngredients).toEqual([])
  })
})

describe('ordering', () => {
  it('puts the most recently hidden dish first', () => {
    const older = menuItem({ id: 'm1', name: 'Carbonara', auto_disabled_at: '2026-07-27T08:00:00Z' })
    const newer = menuItem({ id: 'm2', name: 'Adobo', auto_disabled_at: '2026-07-27T11:00:00Z' })

    const result = explainAutoHiddenDishes([older, newer], [], [], [])

    expect(result.map((d) => d.name)).toEqual(['Adobo', 'Carbonara'])
  })
})
