import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

/** An ingredient as `/api/inventory/dish-recipe` hands it out (`unit_cost` only with `costs`). */
export interface PanelIngredient {
  id: string
  name: string
  stock_unit_id: string
  unit_cost?: number | string | null
}

export type PanelUnit = InventoryUnit

/** The panel's own edit callbacks, so the table and the pick lists stay presentational. */
export interface IngredientChoices {
  ingredients: readonly PanelIngredient[]
  ingredientsById: ReadonlyMap<string, PanelIngredient>
  units: readonly PanelUnit[]
  unitsById: ReadonlyMap<string, PanelUnit>
}
