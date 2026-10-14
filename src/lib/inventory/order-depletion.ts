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

/** The selections of one order line, without its quantity. */
export type DepletionLineSelection = Omit<DepletionOrderItem, 'quantity'>

/** One recipe a line spends, and how many portions of it per unit of the dish. */
export interface LineRecipePortion {
  recipe: Recipe
  /** Add-on portions per parent unit; 1 for the base and single-pick options. */
  portions: number
}

/**
 * Which recipes ONE unit of a configured dish spends, and how many portions of
 * each: the base recipe plus every selected variation option, add-on and
 * modifier option recipe. Option recipes ADD to the base, never replace it.
 *
 * The single definition of "what a line spends", shared by depletion and by
 * every stock guard that must agree with it (`producible.ts`).
 */
export function resolveLineRecipePortions(
  item: DepletionLineSelection,
  recipes: readonly Recipe[],
): LineRecipePortion[] {
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

  const selectedRecipes = [...new Set(recipeIds)]
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => Boolean(recipe))
  // One recipe per selected id: a modifier_option recipe wins over a legacy
  // twin for the same option, so one pick is never spent twice.
  const canonical = new Map<string, Recipe>()
  for (const recipe of selectedRecipes) {
    const selectedId = recipe.modifier_option_id ?? recipe.addon_id ?? recipe.variation_option_id
    const key = selectedId ? `selection:${selectedId}` : `base:${recipe.id}`
    const existing = canonical.get(key)
    if (!existing || recipe.target_type === 'modifier_option') canonical.set(key, recipe)
  }

  return [...canonical.values()].flatMap((recipe) => {
    const addonId = recipe.addon_id ?? recipe.modifier_option_id
    const portions = addonId ? item.addonQuantities?.[addonId] ?? 1 : 1
    if (!Number.isInteger(portions) || portions <= 0) return []
    return [{ recipe, portions }]
  })
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

    for (const { recipe, portions } of resolveLineRecipePortions(item, recipes)) {
      for (const component of componentsByRecipe.get(recipe.id) ?? []) {
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

/** A placed order line, as checkout carries it. */
export interface CheckoutOrderLine {
  menu_item_id: string
  quantity: number
  option_ids?: string[]
  addon_ids?: string[]
  addon_quantities?: Record<string, number>
}

/**
 * A checkout line as depletion (and every guard that must agree with it) reads
 * it. The same id set feeds both option buckets: variation options and unified
 * modifier options both arrive in `option_ids`/`addon_ids` and ids are unique
 * per option, so whichever recipe target exists matches and the other finds
 * nothing.
 */
export function depletionItemFromCheckoutLine(line: CheckoutOrderLine): DepletionOrderItem {
  return {
    menuItemId: line.menu_item_id,
    quantity: line.quantity,
    optionIds: line.option_ids ?? [],
    modifierOptionIds: [...new Set([...(line.option_ids ?? []), ...(line.addon_ids ?? [])])],
    addonIds: line.addon_ids ?? [],
    ...(line.addon_quantities ? { addonQuantities: line.addon_quantities } : {}),
  }
}
