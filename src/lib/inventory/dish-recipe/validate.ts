/**
 * What stops a dish's recipes from saving, said before the round trip and
 * again by the server (`recipeLineProblem` is the one rule every recipe
 * writer applies). Pure.
 */

import { recipeLineProblem, MISSING_INGREDIENT_PROBLEM, type RecipeLineIngredient } from '@/lib/inventory/recipe-line-rules'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import {
  draftColumns,
  type DishRecipeDraft,
  type DishRecipeGroup,
  type DishRecipes,
} from '@/lib/inventory/dish-recipe/model'

export interface DraftProblem {
  /** The row or pick line the problem is on, to mark it. */
  key: string
  message: string
}

export function findDraftProblems(
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
  ingredientsById: ReadonlyMap<string, RecipeLineIngredient>,
  units: readonly InventoryUnit[],
): DraftProblem[] {
  const problems: DraftProblem[] = []
  const columns = draftColumns(draft, groups)
  const tableColumns = new Set(draft.byGroupId === null ? [] : columns)

  for (const row of draft.rows) {
    const ingredient = ingredientsById.get(row.inventoryItemId)
    if (!ingredient) {
      problems.push({ key: row.key, message: MISSING_INGREDIENT_PROBLEM })
      continue
    }
    if (columns.every((column) => !row.amounts[column])) {
      problems.push({
        key: row.key,
        message:
          draft.byGroupId === null
            ? `Enter how much ${ingredient.name} one order uses, or remove it.`
            : `Enter how much ${ingredient.name} each version uses, or remove it.`,
      })
      continue
    }
    // The unit rule only: blank versions are allowed (that version uses none).
    const unitProblem = recipeLineProblem({ quantity: 1, unit_id: row.unitId }, ingredient, units)
    if (unitProblem) problems.push({ key: row.key, message: unitProblem })
  }

  for (const [optionId, lines] of Object.entries(draft.picks)) {
    if (tableColumns.has(optionId)) continue
    for (const line of lines) {
      const ingredient = ingredientsById.get(line.inventoryItemId)
      if (!ingredient) {
        problems.push({ key: line.key, message: MISSING_INGREDIENT_PROBLEM })
        continue
      }
      const problem = recipeLineProblem({ quantity: line.quantity ?? 0, unit_id: line.unitId }, ingredient, units)
      if (problem) problems.push({ key: line.key, message: problem })
    }
  }
  return problems
}

/** The server's check over what will be written: every stored line deductible. */
export function findStoredProblem(
  recipes: DishRecipes,
  ingredientsById: ReadonlyMap<string, RecipeLineIngredient>,
  units: readonly InventoryUnit[],
): string | null {
  const lines = [recipes.base, ...Object.values(recipes.options)].flat()
  for (const line of lines) {
    const ingredient = ingredientsById.get(line.inventoryItemId)
    if (!ingredient) return MISSING_INGREDIENT_PROBLEM
    const problem = recipeLineProblem({ quantity: line.quantity, unit_id: line.unitId }, ingredient, units)
    if (problem) return problem
  }
  return null
}
