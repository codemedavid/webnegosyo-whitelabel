/**
 * Whether a recipe line can ever be deducted — the one rule every recipe
 * writer applies before saving.
 *
 * A line asking for nothing, or measured in a unit that can never convert to
 * the ingredient's stock unit (grams of an egg stocked by the piece), used to
 * be saved and then silently skipped by every sale (`resolveMovementDelta`
 * throws, depletion moves on). Refusing it at save is the only point where the
 * merchant is there to fix it.
 *
 * Pure and dependency-light so the merchant app can mirror it word for word.
 * Weight ↔ volume converts (water-density bridge, `unit-conversion.ts`); count
 * never converts to either.
 */

import { canConvertUnits, type InventoryUnit } from '@/lib/inventory/unit-conversion'

/** The part of a recipe line this rule reads. */
export interface RecipeLineCandidate {
  quantity: number
  unit_id: string
}

/** The part of an ingredient this rule reads. */
export interface RecipeLineIngredient {
  name: string
  stock_unit_id: string
}

const KIND_WORD: Record<InventoryUnit['dimension'], string> = {
  weight: 'a weight',
  volume: 'a volume',
  count: 'a count',
}

/**
 * Why this line cannot be saved, in words for the merchant, or `null` when it
 * is fine.
 *
 * An ingredient whose own stock unit is missing from the catalogue cannot be
 * judged, so only the quantity is checked for it — refusing on our own data
 * gap would block a merchant from saving anything.
 */
export function recipeLineProblem(
  line: RecipeLineCandidate,
  ingredient: RecipeLineIngredient,
  units: readonly InventoryUnit[],
): string | null {
  const name = ingredient.name || 'this ingredient'
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    return `Enter how much ${name} this uses — it must be more than 0.`
  }

  const stockUnit = units.find((unit) => unit.id === ingredient.stock_unit_id)
  if (!stockUnit) return null

  const unit = units.find((candidate) => candidate.id === line.unit_id)
  if (!unit) {
    return `Choose a unit for ${name} (it is stocked in ${stockUnit.abbreviation}).`
  }

  if (!canConvertUnits(unit, stockUnit)) {
    return `${name} is stocked in ${stockUnit.abbreviation}, so it can't be measured in ${unit.abbreviation} — sales would never deduct it. Use ${KIND_WORD[stockUnit.dimension]} unit like ${stockUnit.abbreviation}.`
  }

  return null
}

/** Said when a line names an ingredient that is not (or no longer) in the catalogue. */
export const MISSING_INGREDIENT_PROBLEM =
  'One of the ingredients in this recipe no longer exists. Remove it and save again.'

/**
 * The first problem across a recipe's lines, or `null` when every line can be
 * deducted. Used by the server before it writes and by the editor before it
 * sends, so both say the same thing.
 */
export function findRecipeProblem(
  lines: readonly (RecipeLineCandidate & { inventory_item_id: string })[],
  ingredientsById: ReadonlyMap<string, RecipeLineIngredient>,
  units: readonly InventoryUnit[],
): string | null {
  for (const line of lines) {
    const ingredient = ingredientsById.get(line.inventory_item_id)
    if (!ingredient) return MISSING_INGREDIENT_PROBLEM
    const problem = recipeLineProblem(line, ingredient, units)
    if (problem) return problem
  }
  return null
}

/**
 * The unit a line keeps when its ingredient changes: the current one if it
 * still converts, else the new ingredient's stock unit — so switching from
 * flour (g) to eggs (pc) never leaves a line measured in grams of egg.
 */
export function unitAfterIngredientChange(
  currentUnitId: string,
  stockUnitId: string,
  units: readonly InventoryUnit[],
): string {
  if (!currentUnitId) return stockUnitId
  const stillFits = compatibleRecipeUnits(stockUnitId, units).some((unit) => unit.id === currentUnitId)
  return stillFits ? currentUnitId : stockUnitId
}

/**
 * The units a recipe line for an ingredient stocked in `stockUnitId` may use.
 * Every unit while no ingredient is chosen (or its stock unit is unknown), so
 * the picker is never empty.
 */
export function compatibleRecipeUnits<T extends InventoryUnit>(
  stockUnitId: string,
  units: readonly T[],
): T[] {
  const stockUnit = units.find((unit) => unit.id === stockUnitId)
  if (!stockUnit) return [...units]
  return units.filter((unit) => canConvertUnits(unit, stockUnit))
}

/** The `Error.name` of a refused recipe save, so routes can answer 400 with its message. */
export const RECIPE_LINE_REJECTED = 'RecipeLineRejected'

/** An error carrying a merchant-facing reason a recipe could not be saved. */
export function recipeLineRejection(message: string): Error {
  const error = new Error(message)
  error.name = RECIPE_LINE_REJECTED
  return error
}

export function isRecipeLineRejection(error: unknown): error is Error {
  return error instanceof Error && error.name === RECIPE_LINE_REJECTED
}
