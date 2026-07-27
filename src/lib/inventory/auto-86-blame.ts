/**
 * Why a dish is off the menu.
 *
 * The exact inverse of `auto-86.ts`: that maps exhausted ingredients forward to
 * the dishes they doom, this maps a hidden dish back to the ingredients holding
 * it down. The forward direction is what the system needs to act; this one is
 * what a merchant needs to understand what it did.
 *
 * Pure like its counterpart, and it borrows that counterpart's two rules rather
 * than inventing softer ones:
 *
 *   - **Only a base recipe can hide a dish**, so only a base recipe may be
 *     blamed for it. Blaming an addon's ingredient would send the merchant to
 *     restock something that was never keeping the dish down.
 *   - **Only a marked dish counts.** Without `auto_disabled_at` a person made
 *     the choice, and telling them the system did it is a lie about their own
 *     menu.
 */

import { evaluateStockLevel, type StockLevelInput } from '@/lib/inventory/low-stock'
import type { MenuItem, Recipe, RecipeComponent } from '@/types/database'

export interface BlockingIngredient {
  id: string
  name: string
}

export interface AutoHiddenDish {
  menuItemId: string
  name: string
  /** Raw ISO — formatting a date server-side is a hydration bug. */
  hiddenAt: string
  /**
   * The empty ingredients of this dish's base recipe.
   *
   * Empty means the dish is hidden with nothing left holding it down, which the
   * recovery path should have fixed. That it did not is itself worth seeing.
   */
  blockingIngredients: BlockingIngredient[]
}

/** Base recipe of each menu item — the only recipe that can hide it. */
function indexBaseRecipesByMenuItem(recipes: readonly Recipe[]): Map<string, string[]> {
  const byMenuItem = new Map<string, string[]>()
  for (const recipe of recipes) {
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    const existing = byMenuItem.get(recipe.menu_item_id)
    if (existing) existing.push(recipe.id)
    else byMenuItem.set(recipe.menu_item_id, [recipe.id])
  }
  return byMenuItem
}

function indexComponentsByRecipe(
  components: readonly RecipeComponent[],
): Map<string, string[]> {
  const byRecipe = new Map<string, string[]>()
  for (const component of components) {
    const existing = byRecipe.get(component.recipe_id)
    if (existing) existing.push(component.inventory_item_id)
    else byRecipe.set(component.recipe_id, [component.inventory_item_id])
  }
  return byRecipe
}

/**
 * Every dish the system currently has off the menu, newest first, each with the
 * ingredients responsible.
 *
 * Newest first because the most recent disappearance is the one a merchant is
 * standing there wondering about.
 */
export function explainAutoHiddenDishes(
  menuItems: readonly MenuItem[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
  ingredients: readonly StockLevelInput[],
): AutoHiddenDish[] {
  const hidden = menuItems.filter((item) => !item.is_available && Boolean(item.auto_disabled_at))
  if (hidden.length === 0) return []

  const outOfStock = new Map<string, string>()
  for (const ingredient of ingredients) {
    if (!ingredient.is_active) continue
    if (evaluateStockLevel(ingredient) !== 'out') continue
    outOfStock.set(ingredient.id, ingredient.name)
  }

  const baseRecipeIds = indexBaseRecipesByMenuItem(recipes)
  const componentsByRecipe = indexComponentsByRecipe(components)

  const dishes = hidden.map((item) => {
    // A Map keyed by id so an ingredient shared by two base recipes of the same
    // dish is named once, not twice.
    const blocking = new Map<string, string>()
    for (const recipeId of baseRecipeIds.get(item.id) ?? []) {
      for (const ingredientId of componentsByRecipe.get(recipeId) ?? []) {
        const name = outOfStock.get(ingredientId)
        if (name) blocking.set(ingredientId, name)
      }
    }

    return {
      menuItemId: item.id,
      name: item.name,
      hiddenAt: item.auto_disabled_at as string,
      blockingIngredients: [...blocking].map(([id, name]) => ({ id, name })),
    }
  })

  return [...dishes].sort((a, b) => b.hiddenAt.localeCompare(a.hiddenAt))
}
