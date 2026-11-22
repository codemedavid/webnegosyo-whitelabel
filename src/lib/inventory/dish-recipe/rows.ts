/**
 * `recipes` + `recipe_components` rows ⇄ a dish's `DishRecipes`. Pure.
 *
 * A choice's recipe is read from its own kind (`targetType` from the dish's
 * groups). When only a recipe of another kind exists for the same choice id
 * (a "legacy twin": a dish moved from variations to modifier groups keeps the
 * option ids), depletion still spends it, so it is what this choice holds.
 */

import {
  optionIndex,
  type DishOptionTargetType,
  type DishRecipeChange,
  type DishRecipeGroup,
  type DishRecipes,
  type RecipeLine,
} from '@/lib/inventory/dish-recipe/model'

/** The `recipes` columns this module reads (a local row type: the hand-written database types drift). */
export interface RecipeRow {
  id: string
  target_type: string
  modifier_option_id?: string | null
  variation_option_id?: string | null
  addon_id?: string | null
}

/** The `recipe_components` columns this module reads. */
export interface RecipeComponentRow {
  recipe_id: string
  inventory_item_id: string
  /** numeric(16,4): PostgREST may hand it over as a string. */
  quantity: number | string
  unit_id: string
  sort_order: number
}

const OPTION_KINDS: ReadonlySet<string> = new Set<DishOptionTargetType>(['modifier_option', 'variation_option', 'addon'])

function optionIdOf(recipe: RecipeRow): string | null {
  return recipe.modifier_option_id ?? recipe.variation_option_id ?? recipe.addon_id ?? null
}

export function recipesFromRows(
  groups: readonly DishRecipeGroup[],
  recipes: readonly RecipeRow[],
  components: readonly RecipeComponentRow[],
): DishRecipes {
  const linesByRecipe = new Map<string, RecipeLine[]>()
  for (const component of [...components].sort((a, b) => a.sort_order - b.sort_order)) {
    const lines = linesByRecipe.get(component.recipe_id) ?? []
    lines.push({ inventoryItemId: component.inventory_item_id, quantity: Number(component.quantity), unitId: component.unit_id })
    linesByRecipe.set(component.recipe_id, lines)
  }
  const linesOf = (recipe: RecipeRow | undefined) => (recipe ? linesByRecipe.get(recipe.id) ?? [] : [])

  const base = linesOf(recipes.find((recipe) => recipe.target_type === 'menu_item'))
  const options: Record<string, RecipeLine[]> = {}
  for (const option of optionIndex(groups).values()) {
    const sameId = recipes.filter((recipe) => OPTION_KINDS.has(recipe.target_type) && optionIdOf(recipe) === option.id)
    const own = sameId.find((recipe) => recipe.target_type === option.targetType)
    const lines = own ? linesOf(own) : sameId.map(linesOf).find((candidate) => candidate.length > 0) ?? []
    options[option.id] = lines
  }
  return { base, options }
}

/** The RPC payload for `save_dish_recipes`. */
export interface DishRecipeTargetPayload {
  target_type: 'menu_item' | DishOptionTargetType
  option_id: string | null
  components: { inventory_item_id: string; quantity: number; unit_id: string }[]
}

export function changesToPayload(
  groups: readonly DishRecipeGroup[],
  changes: readonly DishRecipeChange[],
): DishRecipeTargetPayload[] {
  const index = optionIndex(groups)
  return changes.flatMap((change): DishRecipeTargetPayload[] => {
    const target_type = change.optionId === null ? 'menu_item' : index.get(change.optionId)?.targetType
    if (!target_type) return []
    return [{
      target_type,
      option_id: change.optionId,
      components: change.lines.map((line) => ({
        inventory_item_id: line.inventoryItemId,
        quantity: line.quantity,
        unit_id: line.unitId,
      })),
    }]
  })
}
