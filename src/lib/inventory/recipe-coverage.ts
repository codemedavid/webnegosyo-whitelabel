/**
 * Which dishes are actually set up, and which ingredients are doing nothing.
 *
 * Recipes are the gate on this entire feature. Without one, a dish's sale
 * depletes nothing, so no ingredient ever crosses a line, so no alert is raised
 * and nothing is ever 86'd — the stock figure simply never moves. The first
 * tenant to switch inventory on stalled exactly here: one ingredient created,
 * zero recipes, and no screen that could have said so.
 *
 * Until now a recipe was reachable only one dish at a time, from the bottom of
 * the menu-item form. These rules back the surface that answers the two
 * questions that were unanswerable: which dishes still need a recipe, and which
 * ingredients nothing consumes.
 *
 * Pure, like `low-stock.ts` and `menu-availability.ts` — the merchant app will
 * want the same answers and must not compute them differently.
 */

import { normalizeModifierGroups } from '@/lib/modifier-groups'
import type { InventoryItem, MenuItem, ModifierGroup, Recipe, RecipeComponent } from '@/types/database'

export interface RecipeCoverageRow {
  menuItemId: string
  name: string
  /** True only when a base recipe exists AND lists at least one ingredient. */
  hasRecipe: boolean
  ingredientCount: number
  /**
   * Groups on a TRACKED dish where the diner picks portions (flavours ×N,
   * add-ons) but no choice carries a recipe: those picks deduct nothing, so
   * the dish spends only its base recipe, once per order line. Absent when
   * there is nothing to say.
   */
  unrecipedOptionGroups?: string[]
}

export interface RecipeCoverageSummary {
  total: number
  covered: number
  uncovered: number
}

/**
 * How many ingredients each base recipe lists.
 *
 * Only `menu_item` recipes count towards a dish being set up, the same rule
 * auto-86 uses: a prep recipe belongs to an ingredient, and an addon recipe to
 * an option, so neither makes the dish itself depletable.
 */
function countIngredientsPerDish(
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
): Map<string, number> {
  const dishByRecipe = new Map<string, string>()
  for (const recipe of recipes) {
    if (recipe.target_type !== 'menu_item') continue
    if (!recipe.menu_item_id) continue
    dishByRecipe.set(recipe.id, recipe.menu_item_id)
  }

  const counts = new Map<string, number>()
  for (const component of components) {
    const menuItemId = dishByRecipe.get(component.recipe_id)
    if (!menuItemId) continue
    counts.set(menuItemId, (counts.get(menuItemId) ?? 0) + 1)
  }
  return counts
}

/** Option ids that carry their own recipe, per dish. */
function optionRecipeIdsByDish(recipes: readonly Recipe[]): Map<string, Set<string>> {
  const byDish = new Map<string, Set<string>>()
  for (const recipe of recipes) {
    if (!recipe.menu_item_id) continue
    const optionId = recipe.modifier_option_id ?? recipe.addon_id ?? recipe.variation_option_id
    if (!optionId) continue
    const ids = byDish.get(recipe.menu_item_id) ?? new Set<string>()
    ids.add(optionId)
    byDish.set(recipe.menu_item_id, ids)
  }
  return byDish
}

/** A group where the diner can take more than one portion. */
function isPortionGroup(group: ModifierGroup): boolean {
  return group.selection_mode === 'quantity' || group.max_select === null || group.max_select > 1
}

/**
 * The portion groups of a dish whose choices spend no ingredients of their
 * own. A group is left out when any choice has a recipe, is another dish
 * (that dish's recipe is spent) or is counted by hand (simple stock) — the
 * merchant has clearly set that group up.
 */
export function findUnrecipedPortionGroups(
  item: Pick<MenuItem, 'modifier_groups' | 'variation_types' | 'variations' | 'addons'>,
  optionIdsWithRecipe: ReadonlySet<string>,
): string[] {
  return normalizeModifierGroups(item)
    .filter((group) => isPortionGroup(group) && group.options.length > 0)
    .filter((group) => !group.options.some((option) =>
      optionIdsWithRecipe.has(option.id) || option.menu_item_id || option.stock_mode === 'simple'))
    .map((group) => group.name)
}

/**
 * Every dish with whether it has a working recipe.
 *
 * Sorted with the unset dishes first — those are the ones the merchant can act
 * on, and burying them under a long list of finished ones is how the surface
 * would fail at the only job it has. Alphabetical within each group so the list
 * does not reshuffle between visits.
 */
export function buildRecipeCoverage(
  menuItems: readonly MenuItem[],
  recipes: readonly Recipe[],
  components: readonly RecipeComponent[],
): RecipeCoverageRow[] {
  const counts = countIngredientsPerDish(recipes, components)
  const optionRecipes = optionRecipeIdsByDish(recipes)
  const noOptionRecipes: ReadonlySet<string> = new Set()

  const rows = menuItems.map((item): RecipeCoverageRow => {
    const ingredientCount = counts.get(item.id) ?? 0
    // An empty recipe row is a shell that depletes nothing. Calling it
    // covered would report a dish as ready while it does nothing at all.
    const hasRecipe = ingredientCount > 0
    // Only a tracked dish gets the hint; an untracked one is already flagged.
    const unrecipedOptionGroups = hasRecipe
      ? findUnrecipedPortionGroups(item, optionRecipes.get(item.id) ?? noOptionRecipes)
      : []
    return {
      menuItemId: item.id,
      name: item.name,
      hasRecipe,
      ingredientCount,
      ...(unrecipedOptionGroups.length > 0 ? { unrecipedOptionGroups } : {}),
    }
  })

  return rows.sort((a, b) => {
    if (a.hasRecipe !== b.hasRecipe) return a.hasRecipe ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

export function summarizeRecipeCoverage(
  rows: readonly RecipeCoverageRow[],
): RecipeCoverageSummary {
  const covered = rows.filter((row) => row.hasRecipe).length
  return { total: rows.length, covered, uncovered: rows.length - covered }
}

/**
 * Ingredients no recipe consumes — stock that can never move.
 *
 * Deliberately a broader question than coverage: an ingredient used only by an
 * addon or a prep recipe is still consumed by sales, so it is in use even
 * though it makes no dish depletable on its own. Retired ingredients are left
 * out; the merchant has already dealt with those.
 */
export function findUnusedIngredients(
  ingredients: readonly InventoryItem[],
  components: readonly RecipeComponent[],
): InventoryItem[] {
  const used = new Set(components.map((component) => component.inventory_item_id))
  return ingredients.filter((ingredient) => ingredient.is_active && !used.has(ingredient.id))
}
