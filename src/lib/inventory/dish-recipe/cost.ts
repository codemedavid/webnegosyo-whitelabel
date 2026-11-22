/**
 * What a set of recipe lines costs, in pesos, for the table's cost row. Pure.
 * Same arithmetic as `estimateRecipeCost` (recipe-form.ts): each line is
 * converted to its ingredient's stock unit and priced at `unit_cost`.
 */

import { convertBetween, unitLookup, type RecipeLine } from '@/lib/inventory/dish-recipe/model'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

export interface CostedIngredient {
  stock_unit_id: string
  /** Per stock unit; absent when the caller may not see costs, null = never priced. */
  unit_cost?: number | string | null
}

export interface LinesCost {
  pesos: number
  /** Some line had no price or a unit that doesn't convert: the figure is a floor. */
  isPartial: boolean
}

export function costOfLines(
  lines: readonly RecipeLine[],
  ingredientsById: ReadonlyMap<string, CostedIngredient>,
  units: readonly InventoryUnit[],
): LinesCost {
  const lookup = unitLookup(units)
  let pesos = 0
  let isPartial = false
  for (const line of lines) {
    const ingredient = ingredientsById.get(line.inventoryItemId)
    const unitCost = ingredient?.unit_cost === null || ingredient?.unit_cost === undefined ? NaN : Number(ingredient.unit_cost)
    const inStock = ingredient ? convertBetween(line.quantity, line.unitId, ingredient.stock_unit_id, lookup) : null
    if (inStock === null || !Number.isFinite(unitCost) || unitCost <= 0) {
      isPartial = true
      continue
    }
    pesos += inStock * unitCost
  }
  return { pesos: Math.round(pesos * 100) / 100, isPartial }
}
