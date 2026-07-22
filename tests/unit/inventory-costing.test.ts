import {
  computeRecipeCost,
  computeConfiguredCost,
  computeMargin,
  type CostingGraph,
  type CostingIngredient,
  type CostingRecipe,
} from '@/lib/inventory/costing'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

const gram: InventoryUnit = { id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const kilogram: InventoryUnit = { id: 'kg', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const milliliter: InventoryUnit = { id: 'ml', name: 'Milliliter', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 }

/** Build a graph from ingredient + recipe arrays keyed by id. */
function graphOf(ingredients: CostingIngredient[], recipes: CostingRecipe[]): CostingGraph {
  return {
    ingredients: Object.fromEntries(ingredients.map((i) => [i.id, i])),
    recipes: Object.fromEntries(recipes.map((r) => [r.id, r])),
  }
}

// Raw materials: flour ₱0.05/g, cheese ₱0.30/g, oil ₱0.20/ml
const flour: CostingIngredient = { id: 'flour', stockUnit: gram, unitCost: 0.05 }
const cheese: CostingIngredient = { id: 'cheese', stockUnit: gram, unitCost: 0.3 }
const oil: CostingIngredient = { id: 'oil', stockUnit: milliliter, unitCost: 0.2 }

describe('computeRecipeCost', () => {
  test('sums component quantity × unit cost in the ingredient stock unit', () => {
    // 200 g flour × ₱0.05 = ₱10  +  50 g cheese × ₱0.30 = ₱15  ⇒ ₱25
    const recipe: CostingRecipe = {
      id: 'pizza',
      components: [
        { ingredientId: 'flour', quantity: 200, unit: gram },
        { ingredientId: 'cheese', quantity: 50, unit: gram },
      ],
    }
    const graph = graphOf([flour, cheese], [recipe])
    expect(computeRecipeCost('pizza', graph)).toBeCloseTo(25, 6)
  })

  test('converts component units into the ingredient stock unit before costing', () => {
    // Recipe expresses flour in kg, but flour is stocked/priced per gram.
    // 0.2 kg → 200 g × ₱0.05 = ₱10
    const recipe: CostingRecipe = {
      id: 'dough',
      components: [{ ingredientId: 'flour', quantity: 0.2, unit: kilogram }],
    }
    expect(computeRecipeCost('dough', graphOf([flour], [recipe]))).toBeCloseTo(10, 6)
  })

  test('recurses into a prep/composite ingredient using its yield', () => {
    // "sauce" prep recipe: 100 ml oil × ₱0.20 = ₱20, yields 250 ml ⇒ ₱0.08/ml.
    const sauceRecipe: CostingRecipe = {
      id: 'sauce_recipe',
      components: [{ ingredientId: 'oil', quantity: 100, unit: milliliter }],
    }
    const sauce: CostingIngredient = {
      id: 'sauce',
      stockUnit: milliliter,
      prep: { recipeId: 'sauce_recipe', yieldQuantity: 250, yieldUnit: milliliter },
    }
    // Dish uses 50 ml sauce × ₱0.08 = ₱4
    const dish: CostingRecipe = {
      id: 'dish',
      components: [{ ingredientId: 'sauce', quantity: 50, unit: milliliter }],
    }
    const graph = graphOf([oil, sauce], [sauceRecipe, dish])
    expect(computeRecipeCost('dish', graph)).toBeCloseTo(4, 6)
  })

  test('throws when a referenced recipe is missing', () => {
    expect(() => computeRecipeCost('ghost', graphOf([flour], []))).toThrow(/recipe/i)
  })

  test('detects and rejects a recipe cycle', () => {
    // a needs prep-b, b needs prep-a → infinite loop must be caught.
    const prepA: CostingIngredient = { id: 'prepA', stockUnit: gram, prep: { recipeId: 'recA', yieldQuantity: 1, yieldUnit: gram } }
    const prepB: CostingIngredient = { id: 'prepB', stockUnit: gram, prep: { recipeId: 'recB', yieldQuantity: 1, yieldUnit: gram } }
    const recA: CostingRecipe = { id: 'recA', components: [{ ingredientId: 'prepB', quantity: 1, unit: gram }] }
    const recB: CostingRecipe = { id: 'recB', components: [{ ingredientId: 'prepA', quantity: 1, unit: gram }] }
    const graph = graphOf([prepA, prepB], [recA, recB])
    expect(() => computeRecipeCost('recA', graph)).toThrow(/cycle/i)
  })

  test('missing raw unit cost is treated as zero', () => {
    const noCost: CostingIngredient = { id: 'water', stockUnit: milliliter }
    const recipe: CostingRecipe = { id: 'r', components: [{ ingredientId: 'water', quantity: 100, unit: milliliter }] }
    expect(computeRecipeCost('r', graphOf([noCost], [recipe]))).toBe(0)
  })
})

describe('computeConfiguredCost', () => {
  const baseRecipe: CostingRecipe = { id: 'burger_base', components: [{ ingredientId: 'flour', quantity: 100, unit: gram }] } // ₱5
  const largeDelta: CostingRecipe = { id: 'opt_large', components: [{ ingredientId: 'flour', quantity: 100, unit: gram }] } // +₱5
  const cheeseAddon: CostingRecipe = { id: 'addon_cheese', components: [{ ingredientId: 'cheese', quantity: 20, unit: gram }] } // +₱6
  const graph = graphOf([flour, cheese], [baseRecipe, largeDelta, cheeseAddon])

  test('base only', () => {
    expect(
      computeConfiguredCost({ baseRecipeId: 'burger_base', optionRecipeIds: [], addonRecipeIds: [] }, graph),
    ).toBeCloseTo(5, 6)
  })

  test('base + selected variation option + addon (closes the costing gap)', () => {
    expect(
      computeConfiguredCost(
        { baseRecipeId: 'burger_base', optionRecipeIds: ['opt_large'], addonRecipeIds: ['addon_cheese'] },
        graph,
      ),
    ).toBeCloseTo(16, 6)
  })

  test('recipe ids with no recipe contribute zero (not every option is costed)', () => {
    expect(
      computeConfiguredCost(
        { baseRecipeId: 'burger_base', optionRecipeIds: ['opt_unknown'], addonRecipeIds: [] },
        graph,
      ),
    ).toBeCloseTo(5, 6)
  })

  test('no base recipe returns zero', () => {
    expect(computeConfiguredCost({ baseRecipeId: null, optionRecipeIds: [], addonRecipeIds: [] }, graph)).toBe(0)
  })
})

describe('computeMargin', () => {
  test('computes profit and margin percent', () => {
    expect(computeMargin(100, 40)).toEqual({ profit: 60, marginPercent: 60 })
  })

  test('negative margin when cost exceeds price', () => {
    const m = computeMargin(50, 80)
    expect(m.profit).toBe(-30)
    expect(m.marginPercent).toBeCloseTo(-60, 6)
  })

  test('zero price yields zero margin percent (no divide-by-zero)', () => {
    expect(computeMargin(0, 10)).toEqual({ profit: -10, marginPercent: 0 })
  })
})
