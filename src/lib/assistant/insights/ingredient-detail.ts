/**
 * One ingredient (or one dish's recipe) as Owl explains it — pure, over the
 * same stock graph the storefront ceilings and checkout guard read
 * (`readTenantStockGraph` + `resolveProducibleUnits`), so "you can still make
 * 14 Sisig" is the number the menu would cap at, never Owl's own arithmetic.
 */

import { resolveProducibleUnits, type ProducibleStock } from '@/lib/inventory/producible'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { Recipe, RecipeComponent } from '@/types/database'

export interface StockGraphLike {
  recipes: readonly Recipe[]
  components: readonly RecipeComponent[]
  shelf: readonly ProducibleStock[]
  units: readonly InventoryUnit[]
  namesByMenuItemId: ReadonlyMap<string, string>
}

export interface DishUse {
  menuItemId: string
  dish: string
  /** "120 g" per dish. */
  perDish: string
  /** Whole dishes the shelf still covers; null = no ceiling (recipe not judgeable). */
  canMake: number | null
}

export interface IngredientUsage {
  dishes: DishUse[]
  /** Recipes that are not a dish's base recipe (sizes, add-ons, choices, prep). */
  otherRecipes: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function unitLabel(units: readonly InventoryUnit[], unitId: string): string {
  const unit = units.find((row) => row.id === unitId)
  return unit?.abbreviation || unit?.name || ''
}

export function quantityLabel(quantity: number, unit: string): string {
  return `${round2(quantity)}${unit ? ` ${unit}` : ''}`
}

/** Which dishes use this ingredient, and how many of each the shelf still covers. */
export function ingredientUsage(ingredientId: string, graph: StockGraphLike): IngredientUsage {
  const recipeById = new Map(graph.recipes.map((recipe) => [recipe.id, recipe]))
  const dishes = new Map<string, DishUse>()
  let otherRecipes = 0
  for (const component of graph.components) {
    if (component.inventory_item_id !== ingredientId) continue
    const recipe = recipeById.get(component.recipe_id)
    if (!recipe) continue
    if (recipe.target_type !== 'menu_item' || !recipe.menu_item_id) {
      otherRecipes += 1
      continue
    }
    if (dishes.has(recipe.menu_item_id)) continue
    dishes.set(recipe.menu_item_id, {
      menuItemId: recipe.menu_item_id,
      dish: graph.namesByMenuItemId.get(recipe.menu_item_id) ?? 'A dish',
      perDish: quantityLabel(Number(component.quantity) || 0, unitLabel(graph.units, component.unit_id)),
      canMake: resolveProducibleUnits({ menuItemId: recipe.menu_item_id }, graph.recipes, graph.components, graph.shelf, graph.units),
    })
  }
  // Fewest left first: that is the dish the owner has to act on.
  const ordered = [...dishes.values()].sort((a, b) => (a.canMake ?? Infinity) - (b.canMake ?? Infinity) || a.dish.localeCompare(b.dish))
  return { dishes: ordered, otherRecipes }
}

export interface RecipeLine {
  ingredientId: string
  ingredient: string
  perDish: string
  onHand: string | null
}

export interface DishRecipe {
  lines: RecipeLine[]
  canMake: number | null
}

/** A dish's base recipe, each line with what is on the shelf. Null when the dish has no base recipe. */
export function dishRecipe(
  menuItemId: string,
  graph: StockGraphLike,
  ingredientNames: ReadonlyMap<string, { name: string; onHand: string }>,
): DishRecipe | null {
  const recipe = graph.recipes.find((row) => row.target_type === 'menu_item' && row.menu_item_id === menuItemId)
  if (!recipe) return null
  const lines = graph.components
    .filter((component) => component.recipe_id === recipe.id)
    .map((component) => {
      const known = ingredientNames.get(component.inventory_item_id)
      return {
        ingredientId: component.inventory_item_id,
        ingredient: known?.name ?? 'Unknown ingredient',
        perDish: quantityLabel(Number(component.quantity) || 0, unitLabel(graph.units, component.unit_id)),
        onHand: known?.onHand ?? null,
      }
    })
  return {
    lines,
    canMake: lines.length === 0 ? null : resolveProducibleUnits({ menuItemId }, graph.recipes, graph.components, graph.shelf, graph.units),
  }
}

/** What a movement reason reads as to an owner. */
export const MOVEMENT_LABEL: Readonly<Record<string, string>> = {
  receive: 'Received',
  waste: 'Wasted',
  stocktake: 'Counted',
  sale: 'Sold',
  void: 'Order cancelled',
  transfer_out: 'Sent to a branch',
  transfer_in: 'Arrived from a branch',
}
