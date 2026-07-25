/**
 * Pure costing rollup for the inventory system.
 *
 * A `CostingGraph` is an in-memory projection of the tenant's ingredients and
 * recipes. All functions here are side-effect free so they can be unit-tested
 * exhaustively and reused on both server (dashboards, order explosion) and, if
 * needed, client (live cost preview in the item editor).
 *
 * Cost model:
 *   raw ingredient  → unitCost (per stock unit; manual today, moving-average later)
 *   prep ingredient → cost of its own recipe ÷ yield (recursive, cycle-guarded)
 *   recipe          → Σ component.quantity (converted to the ingredient's stock
 *                     unit) × the ingredient's effective unit cost
 *   configured item → base recipe + selected variation-option recipes + addon
 *                     recipes — this is what finally gives variations & addons a
 *                     real cost (the gap the feature closes).
 */

import { convertQuantity, type InventoryUnit } from '@/lib/inventory/unit-conversion'

export interface CostingComponent {
  ingredientId: string
  quantity: number
  unit: InventoryUnit
}

export interface CostingRecipe {
  id: string
  components: CostingComponent[]
}

export interface CostingIngredient {
  id: string
  /** Unit the ingredient is stocked and priced in. */
  stockUnit: InventoryUnit
  /** Cost per stock unit for a raw material. Missing is treated as 0. */
  unitCost?: number
  /** Present when this ingredient is a composite/prep made from its own recipe. */
  prep?: {
    recipeId: string
    /** How much the prep recipe yields, expressed in `yieldUnit`. */
    yieldQuantity: number
    yieldUnit: InventoryUnit
  }
}

export interface CostingGraph {
  ingredients: Record<string, CostingIngredient>
  recipes: Record<string, CostingRecipe>
}

/** Effective cost per stock unit of an ingredient, recursing into preps. */
function resolveIngredientUnitCost(
  ingredientId: string,
  graph: CostingGraph,
  visiting: ReadonlySet<string>,
): number {
  const ingredient = graph.ingredients[ingredientId]
  if (!ingredient) {
    throw new Error(`Unknown ingredient: ${ingredientId}`)
  }

  if (!ingredient.prep) {
    return ingredient.unitCost ?? 0
  }

  const { recipeId, yieldQuantity, yieldUnit } = ingredient.prep
  const recipeCost = costRecipe(recipeId, graph, visiting)
  const yieldInStockUnit = convertQuantity(yieldQuantity, yieldUnit, ingredient.stockUnit)
  if (yieldInStockUnit <= 0) {
    throw new Error(`Prep ingredient ${ingredientId} has a non-positive yield`)
  }
  return recipeCost / yieldInStockUnit
}

function costRecipe(recipeId: string, graph: CostingGraph, visiting: ReadonlySet<string>): number {
  if (visiting.has(recipeId)) {
    throw new Error(`Recipe cycle detected at ${recipeId}`)
  }
  const recipe = graph.recipes[recipeId]
  if (!recipe) {
    throw new Error(`Unknown recipe: ${recipeId}`)
  }

  const nextVisiting = new Set(visiting).add(recipeId)

  return recipe.components.reduce((sum, component) => {
    const ingredient = graph.ingredients[component.ingredientId]
    if (!ingredient) {
      throw new Error(`Unknown ingredient: ${component.ingredientId}`)
    }
    const quantityInStockUnit = convertQuantity(component.quantity, component.unit, ingredient.stockUnit)
    const unitCost = resolveIngredientUnitCost(component.ingredientId, graph, nextVisiting)
    return sum + quantityInStockUnit * unitCost
  }, 0)
}

/** Total ingredient cost of a single recipe. Throws on missing/cyclic recipes. */
export function computeRecipeCost(recipeId: string, graph: CostingGraph): number {
  return costRecipe(recipeId, graph, new Set())
}

export interface ConfiguredCostInput {
  /** Base recipe for the item's default configuration (null → uncosted item). */
  baseRecipeId?: string | null
  /** Recipes for the selected variation options (incremental deltas). */
  optionRecipeIds: string[]
  /** Recipes for the selected addons. */
  addonRecipeIds: string[]
}

/**
 * Cost of a specific item configuration = base + selected option deltas + addons.
 * Recipe ids that have no matching recipe contribute 0 (not every option or
 * addon is costed), so this never throws on absence.
 */
export function computeConfiguredCost(input: ConfiguredCostInput, graph: CostingGraph): number {
  const ids = [
    ...(input.baseRecipeId ? [input.baseRecipeId] : []),
    ...input.optionRecipeIds,
    ...input.addonRecipeIds,
  ]
  return ids.reduce((sum, id) => (graph.recipes[id] ? sum + computeRecipeCost(id, graph) : sum), 0)
}

export interface Margin {
  profit: number
  marginPercent: number
}

/** Profit and margin% of a price against a cost. Zero price → 0% (no NaN). */
export function computeMargin(price: number, cost: number): Margin {
  const profit = price - cost
  return {
    profit,
    marginPercent: price > 0 ? (profit / price) * 100 : 0,
  }
}
