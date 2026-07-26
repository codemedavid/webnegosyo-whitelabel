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
  /**
   * Selected variation / modifier / addon ids.
   *
   * Nothing supplies these yet: order items carry `variation` as a comma-joined
   * display string and addons as names, so no ids survive to the order. They
   * are accepted here so that wiring ids through the order payload later is a
   * change to one caller rather than a redesign. Deriving ids by splitting a
   * display string was rejected — a name containing a comma would silently
   * deplete the wrong ingredient.
   */
  optionIds?: string[]
  addonIds?: string[]
  modifierOptionIds?: string[]
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
    if (item.quantity <= 0) continue

    const configured = resolveConfiguredRecipeIds(
      item.menuItemId,
      item.optionIds ?? [],
      item.addonIds ?? [],
      recipes,
      item.modifierOptionIds ?? [],
    )

    const recipeIds = [
      ...(configured.baseRecipeId ? [configured.baseRecipeId] : []),
      ...configured.optionRecipeIds,
      ...configured.addonRecipeIds,
    ]

    for (const recipeId of recipeIds) {
      for (const component of componentsByRecipe.get(recipeId) ?? []) {
        const key = `${component.inventory_item_id}::${component.unit_id}`
        const existing = totals.get(key)
        const quantity = component.quantity * item.quantity
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
