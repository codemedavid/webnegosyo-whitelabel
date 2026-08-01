/**
 * Pure form helpers for the modifier-option recipe-attach control.
 *
 * The editor holds each component line as UI strings; these helpers coerce a
 * form into the validated `RecipeInput` (reusing the service schema so client
 * and server raise identical messages), round-trip an existing recipe back into
 * editable lines, and estimate a live raw-ingredient cost for preview.
 *
 * The estimate treats every ingredient as raw (unit_cost × converted quantity);
 * the authoritative recursive rollup (prep ingredients, yields) happens
 * server-side via `costing.ts`. Lines with an unknown ingredient/unit, or a
 * cross-dimension unit mismatch, are skipped rather than throwing so a
 * half-filled form never breaks the preview.
 */

import { recipeInputSchema, type RecipeInput } from '@/lib/inventory/schemas'
import type { RecipeWithComponents } from '@/lib/inventory/recipes-service'
import { convertQuantity, type InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { InventoryItem, InventoryUnitRow } from '@/types/database'

export interface RecipeLineDraft {
  inventory_item_id: string
  quantity: string
  unit_id: string
  /**
   * Identity for the editor's list, never sent to the server.
   *
   * A recipe line is a row of controls holding typed text, and React needs a
   * key that belongs to the line rather than to its position. Keyed by index,
   * removing the second of four lines re-keys every line below it and carries
   * the typed values up into the wrong rows.
   */
  uid?: string
}

export const EMPTY_RECIPE_LINE: RecipeLineDraft = {
  inventory_item_id: '',
  quantity: '',
  unit_id: '',
}

let lineCounter = 0

/** A blank line with an identity of its own. */
export function createEmptyRecipeLine(): RecipeLineDraft {
  lineCounter += 1
  return { ...EMPTY_RECIPE_LINE, uid: `line-${lineCounter}` }
}

export interface RecipeFormState {
  notes: string
  lines: RecipeLineDraft[]
  /**
   * How much a prep recipe makes. Only the prep-item target collects these;
   * every other target leaves them blank and they are omitted from the input.
   */
  yieldQuantity?: string
  yieldUnitId?: string
}

function isBlankLine(line: RecipeLineDraft): boolean {
  return (
    line.inventory_item_id === '' && line.unit_id === '' && line.quantity.trim() === ''
  )
}

function quantityOrZero(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') return 0
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * A yield only counts when both halves are present — a quantity with no unit
 * is uninterpretable, and a unit with no quantity says nothing. Either way the
 * pair is dropped rather than half-saved.
 */
function yieldFields(form: RecipeFormState): Partial<RecipeInput> {
  const quantity = form.yieldQuantity?.trim()
  const unitId = form.yieldUnitId?.trim()
  if (!quantity || !unitId) return {}
  return { yield_quantity: quantityOrZero(quantity), yield_unit_id: unitId }
}

/** Coerce and validate the form into service input, dropping empty lines. */
export function buildRecipeInput(form: RecipeFormState): RecipeInput {
  const notes = form.notes.trim()
  return recipeInputSchema.parse({
    ...yieldFields(form),
    notes: notes === '' ? null : notes,
    components: form.lines
      .filter((line) => !isBlankLine(line))
      .map((line) => ({
        inventory_item_id: line.inventory_item_id,
        quantity: quantityOrZero(line.quantity),
        unit_id: line.unit_id,
      })),
  })
}

/** Round-trip an existing recipe into editable lines; null → one blank line. */
export function recipeFormFromData(data: RecipeWithComponents | null): RecipeFormState {
  const yieldQuantity =
    data?.recipe.yield_quantity != null ? String(data.recipe.yield_quantity) : ''
  const yieldUnitId = data?.recipe.yield_unit_id ?? ''

  if (!data || data.components.length === 0) {
    return {
      notes: data?.recipe.notes ?? '',
      lines: [createEmptyRecipeLine()],
      yieldQuantity,
      yieldUnitId,
    }
  }
  return {
    notes: data.recipe.notes ?? '',
    lines: data.components.map((component, index) => ({
      inventory_item_id: component.inventory_item_id,
      quantity: String(component.quantity),
      unit_id: component.unit_id,
      uid: `component-${index}`,
    })),
    yieldQuantity,
    yieldUnitId,
  }
}

function toInventoryUnit(row: InventoryUnitRow): InventoryUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: row.to_base_factor,
  }
}

/**
 * Live raw-ingredient cost estimate for the current lines. Best-effort: a line
 * is skipped when its ingredient/unit is unknown or the units are in different
 * dimensions, so a partially-filled form never throws.
 */
export function estimateRecipeCost(
  lines: RecipeLineDraft[],
  ingredients: InventoryItem[],
  units: InventoryUnitRow[],
): number {
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))
  const unitById = new Map(units.map((u) => [u.id, u]))

  return lines.reduce((sum, line) => {
    const ingredient = ingredientById.get(line.inventory_item_id)
    const lineUnit = unitById.get(line.unit_id)
    const stockUnit = ingredient ? unitById.get(ingredient.stock_unit_id) : undefined
    if (!ingredient || !lineUnit || !stockUnit) return sum
    if (lineUnit.dimension !== stockUnit.dimension) return sum

    const quantity = quantityOrZero(line.quantity)
    const quantityInStockUnit = convertQuantity(
      quantity,
      toInventoryUnit(lineUnit),
      toInventoryUnit(stockUnit),
    )
    return sum + quantityInStockUnit * (ingredient.unit_cost ?? 0)
  }, 0)
}
