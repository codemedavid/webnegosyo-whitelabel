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

  const blockedRecipeIds = new Set<string>()
  for (const component of components) {
    if (outOfStock.has(component.inventory_item_id)) {
      blockedRecipeIds.add(component.recipe_id)
    }
  }
  if (blockedRecipeIds.size === 0) return []

  const menuItemIds = new Set<string>()
  for (const recipe of recipes) {
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    if (!blockedRecipeIds.has(recipe.id)) continue
    menuItemIds.add(recipe.menu_item_id)
  }

  return [...menuItemIds]
}
