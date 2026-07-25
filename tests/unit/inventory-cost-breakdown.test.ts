/**
 * Per-target cost breakdown for one menu item.
 *
 * The costing core already knows how to cost a single recipe; this maps a
 * tenant's recipe rows onto the item's costable targets (base, variation
 * options, addons, unified modifier options) so the admin editors can show a
 * live recipe-derived cost per row.
 *
 * A broken recipe (cycle, missing ingredient) must degrade to a reported error
 * for that one entry rather than taking down the whole breakdown.
 */

import { describe, it, expect } from '@jest/globals'
import { computeMenuItemCostBreakdown } from '@/lib/inventory/cost-breakdown'
import type { CostingGraph } from '@/lib/inventory/costing'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe } from '@/types/database'

const GRAM: InventoryUnit = {
  id: 'u-g',
  name: 'Gram',
  abbreviation: 'g',
  dimension: 'weight',
  to_base_factor: 1,
}

const MENU_ITEM_ID = 'item-1'

function makeRecipe(overrides: Partial<Recipe> & Pick<Recipe, 'id' | 'target_type'>): Recipe {
  return {
    tenant_id: 'tenant-1',
    menu_item_id: MENU_ITEM_ID,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
    ...overrides,
  } as Recipe
}

// beef @ 2/g — every recipe below is priced off this single ingredient.
const graph: CostingGraph = {
  ingredients: {
    beef: { id: 'beef', stockUnit: GRAM, unitCost: 2 },
  },
  recipes: {
    'r-base': { id: 'r-base', components: [{ ingredientId: 'beef', quantity: 10, unit: GRAM }] },
    'r-opt': { id: 'r-opt', components: [{ ingredientId: 'beef', quantity: 5, unit: GRAM }] },
    'r-addon': { id: 'r-addon', components: [{ ingredientId: 'beef', quantity: 3, unit: GRAM }] },
    'r-mod': { id: 'r-mod', components: [{ ingredientId: 'beef', quantity: 4, unit: GRAM }] },
  },
}

describe('computeMenuItemCostBreakdown', () => {
  it('returns a null base cost and empty maps when the item has no recipes', () => {
    const breakdown = computeMenuItemCostBreakdown(MENU_ITEM_ID, [], graph)

    expect(breakdown.baseCost).toBeNull()
    expect(breakdown.variationOptionCosts).toEqual({})
    expect(breakdown.addonCosts).toEqual({})
    expect(breakdown.modifierOptionCosts).toEqual({})
    expect(breakdown.errors).toEqual([])
  })

  it('costs the base recipe of the item', () => {
    const recipes = [makeRecipe({ id: 'r-base', target_type: 'menu_item' })]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).baseCost).toBe(20)
  })

  it('keys variation option costs by variation_option_id', () => {
    const recipes = [
      makeRecipe({ id: 'r-opt', target_type: 'variation_option', variation_option_id: 'size-lg' }),
    ]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).variationOptionCosts).toEqual({
      'size-lg': 10,
    })
  })

  it('keys addon costs by addon_id', () => {
    const recipes = [makeRecipe({ id: 'r-addon', target_type: 'addon', addon_id: 'extra-cheese' })]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).addonCosts).toEqual({
      'extra-cheese': 6,
    })
  })

  it('keys unified modifier option costs by modifier_option_id', () => {
    const recipes = [
      makeRecipe({ id: 'r-mod', target_type: 'modifier_option', modifier_option_id: 'opt-7' }),
    ]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).modifierOptionCosts).toEqual({
      'opt-7': 8,
    })
  })

  it('ignores recipes belonging to a different menu item', () => {
    const recipes = [
      makeRecipe({ id: 'r-base', target_type: 'menu_item', menu_item_id: 'other-item' }),
    ]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).baseCost).toBeNull()
  })

  it('ignores prep_item recipes, which are not item-scoped targets', () => {
    const recipes = [
      makeRecipe({
        id: 'r-base',
        target_type: 'prep_item',
        menu_item_id: null,
        prep_item_id: 'prep-1',
      }),
    ]

    expect(computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph).baseCost).toBeNull()
  })

  it('builds every target type together in one pass', () => {
    const recipes = [
      makeRecipe({ id: 'r-base', target_type: 'menu_item' }),
      makeRecipe({ id: 'r-opt', target_type: 'variation_option', variation_option_id: 'size-lg' }),
      makeRecipe({ id: 'r-addon', target_type: 'addon', addon_id: 'extra-cheese' }),
      makeRecipe({ id: 'r-mod', target_type: 'modifier_option', modifier_option_id: 'opt-7' }),
    ]

    const breakdown = computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, graph)

    expect(breakdown.baseCost).toBe(20)
    expect(breakdown.variationOptionCosts).toEqual({ 'size-lg': 10 })
    expect(breakdown.addonCosts).toEqual({ 'extra-cheese': 6 })
    expect(breakdown.modifierOptionCosts).toEqual({ 'opt-7': 8 })
    expect(breakdown.errors).toEqual([])
  })

  it('reports a broken recipe as an error without losing the other entries', () => {
    const cyclicGraph: CostingGraph = {
      ingredients: {
        ...graph.ingredients,
        // A prep ingredient whose recipe consumes itself.
        loop: {
          id: 'loop',
          stockUnit: GRAM,
          prep: { recipeId: 'r-loop', yieldQuantity: 1, yieldUnit: GRAM },
        },
      },
      recipes: {
        ...graph.recipes,
        'r-loop': { id: 'r-loop', components: [{ ingredientId: 'loop', quantity: 1, unit: GRAM }] },
      },
    }
    const recipes = [
      makeRecipe({ id: 'r-base', target_type: 'menu_item' }),
      makeRecipe({ id: 'r-loop', target_type: 'variation_option', variation_option_id: 'bad' }),
    ]

    const breakdown = computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, cyclicGraph)

    expect(breakdown.baseCost).toBe(20)
    expect(breakdown.variationOptionCosts).toEqual({})
    expect(breakdown.errors).toHaveLength(1)
    expect(breakdown.errors[0]).toContain('bad')
  })

  it('reports a broken base recipe as a null base cost plus an error', () => {
    const brokenGraph: CostingGraph = {
      ingredients: {},
      recipes: {
        'r-base': { id: 'r-base', components: [{ ingredientId: 'missing', quantity: 1, unit: GRAM }] },
      },
    }
    const recipes = [makeRecipe({ id: 'r-base', target_type: 'menu_item' })]

    const breakdown = computeMenuItemCostBreakdown(MENU_ITEM_ID, recipes, brokenGraph)

    expect(breakdown.baseCost).toBeNull()
    expect(breakdown.errors).toHaveLength(1)
  })
})
