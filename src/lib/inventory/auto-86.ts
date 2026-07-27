/**
 * Auto-86: resolving which menu items an exhausted ingredient makes unsellable.
 *
 * Pure, like `low-stock.ts` — the decision of what to take off the menu is
 * separable from the act of taking it off, and only the pure half is worth
 * testing exhaustively.
 *
 * **Only a base recipe can 86 an item.** An ingredient used solely by a
 * variation option, modifier option, or addon leaves the item sellable in its
 * other configurations, and pulling the whole item would cost the merchant
 * sales they could still have made. The narrower fix — disabling just the
 * option — needs per-option availability that does not exist yet.
 *
 * There is deliberately no cascade through prep items: a prep item is stocked
 * in its own right and depletes as an ordinary component, so when it runs out
 * it arrives here as an out-of-stock ingredient on its own account.
 */

import type { Recipe, RecipeComponent } from '@/types/database'

/** Base recipes (recipe id → menu item id) — the only ones that can 86 an item. */
function indexBaseRecipes(recipes: readonly Recipe[]): Map<string, string> {
  const base = new Map<string, string>()
  for (const recipe of recipes) {
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    base.set(recipe.id, recipe.menu_item_id)
  }
  return base
}

/**
 * Menu item ids whose base recipe depends on at least one exhausted ingredient.
 *
 * Ids are unique and returned in the order their recipes appear, so a caller
 * writing them to the database gets a stable, replayable list. Filtering out
 * the items that are already unavailable is the caller's job — it is the one
 * that knows the current menu.
 */
export function resolveMenuItemsToDisable(
  outOfStockIngredientIds: readonly string[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
): string[] {
  if (outOfStockIngredientIds.length === 0) return []

  const outOfStock = new Set(outOfStockIngredientIds)

  const baseRecipes = indexBaseRecipes(recipes)

  const menuItemIds = new Set<string>()
  for (const component of components) {
    if (!outOfStock.has(component.inventory_item_id)) continue
    const menuItemId = baseRecipes.get(component.recipe_id)
    if (menuItemId) menuItemIds.add(menuItemId)
  }

  return [...menuItemIds]
}

/**
 * Menu items that can go back on the menu now that an ingredient is stocked
 * again.
 *
 * The question is the mirror image of disabling, not its negation: disabling
 * asks whether ANY base ingredient ran out, so re-enabling has to ask whether
 * EVERY base ingredient is in stock. A dish needing flour and sugar is still
 * unsellable when the flour arrives and the sugar has not.
 *
 * `components` must therefore be the COMPLETE component list of each candidate
 * base recipe, not only the rows naming a recovered ingredient — a partial list
 * would read as a fully-stocked recipe and put the dish back too early.
 *
 * Deciding which of these the system is actually entitled to re-enable is the
 * caller's job: only an item this system took off the menu may be put back.
 */
export function resolveMenuItemsToReEnable(
  recoveredIngredientIds: readonly string[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  outOfStockIngredientIds: readonly string[],
): string[] {
  if (recoveredIngredientIds.length === 0) return []

  const recovered = new Set(recoveredIngredientIds)
  const outOfStock = new Set(outOfStockIngredientIds)
  const baseRecipes = indexBaseRecipes(recipes)

  const touchedRecipeIds = new Set<string>()
  const blockedRecipeIds = new Set<string>()
  for (const component of components) {
    if (!baseRecipes.has(component.recipe_id)) continue
    if (recovered.has(component.inventory_item_id)) touchedRecipeIds.add(component.recipe_id)
    if (outOfStock.has(component.inventory_item_id)) blockedRecipeIds.add(component.recipe_id)
  }

  const menuItemIds = new Set<string>()
  for (const recipeId of touchedRecipeIds) {
    if (blockedRecipeIds.has(recipeId)) continue
    const menuItemId = baseRecipes.get(recipeId)
    if (menuItemId) menuItemIds.add(menuItemId)
  }

  return [...menuItemIds]
}
