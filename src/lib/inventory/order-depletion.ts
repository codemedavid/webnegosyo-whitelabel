/**
 * Pure resolution of what an order takes off the shelf.
 *
 * Given the lines of an order plus the tenant's recipes, this produces one
 * entry per (ingredient, unit) pair: the consumer of `resolveConfiguredRecipeIds`
 * that Phase 0 built the capability for.
 *
 * Quantities are NOT converted here. A recipe may measure flour in grams and
 * another in kilograms; converting needs the ingredient's stock unit, which is
 * the ledger's job (`stock-ledger.ts`). Merging only within a unit keeps this
 * module free of that dependency and keeps the conversion in one place.
 */

import { resolveConfiguredRecipeIds } from '@/lib/inventory/graph-builder'
import type { Recipe, RecipeComponent } from '@/types/database'

export interface DepletionOrderItem {
  menuItemId: string
  quantity: number
  /** Stable selected IDs from checkout or the persisted order snapshot. */
  optionIds?: string[]
  addonIds?: string[]
  modifierOptionIds?: string[]
  /** Add-on portions per parent unit; absent means one. */
  addonQuantities?: Record<string, number>
}

export interface StockDepletion {
  inventoryItemId: string
  /** Magnitude in `unitId`; the ledger signs and converts it. */
  quantity: number
  unitId: string
}

/**
 * How much of each ingredient one order consumes.
 *
 * An item with no recipe contributes nothing rather than throwing — most menus
 * are only partly costed, and an uncosted item must never break an order.
 */
export function resolveOrderDepletions(
  items: readonly DepletionOrderItem[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
): StockDepletion[] {
  const componentsByRecipe = new Map<string, RecipeComponent[]>()
  for (const component of components) {
    const list = componentsByRecipe.get(component.recipe_id) ?? []
    list.push(component)
    componentsByRecipe.set(component.recipe_id, list)
  }

  // Keyed by ingredient + unit: same ingredient in different units stays apart.
  const totals = new Map<string, StockDepletion>()

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue

    const configured = resolveConfiguredRecipeIds(
      item.menuItemId,
      item.optionIds ?? [],
      item.addonIds ?? [],
      recipes,
      [...new Set([...(item.modifierOptionIds ?? []), ...(item.optionIds ?? []), ...(item.addonIds ?? [])])],
    )

    const recipeIds = [
      ...(configured.baseRecipeId ? [configured.baseRecipeId] : []),
      ...configured.optionRecipeIds,
      ...configured.addonRecipeIds,
    ]

    const selectedRecipes = [...new Set(recipeIds)].map((id) => recipes.find((recipe) => recipe.id === id)).filter((recipe): recipe is Recipe => Boolean(recipe))
    const canonical = new Map<string, Recipe>()
    for (const recipe of selectedRecipes) {
      const selectedId = recipe.modifier_option_id ?? recipe.addon_id ?? recipe.variation_option_id
      const key = selectedId ? `selection:${selectedId}` : `base:${recipe.id}`
      const existing = canonical.get(key)
      if (!existing || recipe.target_type === 'modifier_option') canonical.set(key, recipe)
    }
    for (const recipe of canonical.values()) {
      const recipeId = recipe.id
      const addonId = recipe.addon_id ?? recipe.modifier_option_id
      const portions = addonId ? item.addonQuantities?.[addonId] ?? 1 : 1
      if (!Number.isInteger(portions) || portions <= 0) continue
      for (const component of componentsByRecipe.get(recipeId) ?? []) {
        const key = `${component.inventory_item_id}::${component.unit_id}`
        const existing = totals.get(key)
        const quantity = component.quantity * item.quantity * portions
        totals.set(key, {
          inventoryItemId: component.inventory_item_id,
          unitId: component.unit_id,
          quantity: (existing?.quantity ?? 0) + quantity,
        })
      }
    }
  }

  return [...totals.values()].filter((d) => d.quantity > 0)
}
