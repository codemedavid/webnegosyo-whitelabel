/**
 * Bridges persisted inventory rows into the pure `CostingGraph` the costing
 * core consumes, plus resolves which recipes make up a specific item
 * configuration. Kept pure (no DB) so the mapping is unit-tested independently
 * of Supabase.
 */

import type { CostingGraph, CostingIngredient, CostingRecipe } from '@/lib/inventory/costing'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { ConfiguredCostInput } from '@/lib/inventory/costing'
import type {
  InventoryUnitRow,
  InventoryItem,
  Recipe,
  RecipeComponent,
} from '@/types/database'

function toUnit(row: InventoryUnitRow): InventoryUnit {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    dimension: row.dimension,
    to_base_factor: row.to_base_factor,
  }
}

function requireUnit(units: Map<string, InventoryUnit>, unitId: string, context: string): InventoryUnit {
  const unit = units.get(unitId)
  if (!unit) {
    throw new Error(`Unknown inventory unit ${unitId} referenced by ${context}`)
  }
  return unit
}

/** Build the in-memory costing graph from raw tenant rows. */
export function buildCostingGraph(
  unitRows: readonly InventoryUnitRow[],
  itemRows: readonly InventoryItem[],
  recipeRows: readonly Recipe[],
  componentRows: readonly RecipeComponent[],
): CostingGraph {
  const units = new Map(unitRows.map((u) => [u.id, toUnit(u)]))

  // Prep item id → its prep recipe (for cost derivation via yield).
  const prepRecipeByItem = new Map(
    recipeRows.filter((r) => r.target_type === 'prep_item' && r.prep_item_id).map((r) => [r.prep_item_id as string, r]),
  )

  const ingredients: Record<string, CostingIngredient> = {}
  for (const row of itemRows) {
    const stockUnit = requireUnit(units, row.stock_unit_id, `ingredient ${row.id}`)
    const base: CostingIngredient = { id: row.id, stockUnit, unitCost: row.unit_cost }
    if (row.is_prep) {
      const prep = prepRecipeByItem.get(row.id)
      if (prep && prep.yield_quantity != null && prep.yield_unit_id) {
        base.prep = {
          recipeId: prep.id,
          yieldQuantity: prep.yield_quantity,
          yieldUnit: requireUnit(units, prep.yield_unit_id, `prep yield of ${row.id}`),
        }
      }
    }
    ingredients[row.id] = base
  }

  const componentsByRecipe = new Map<string, RecipeComponent[]>()
  for (const c of componentRows) {
    const list = componentsByRecipe.get(c.recipe_id) ?? []
    list.push(c)
    componentsByRecipe.set(c.recipe_id, list)
  }

  const recipes: Record<string, CostingRecipe> = {}
  for (const r of recipeRows) {
    const rows = (componentsByRecipe.get(r.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
    recipes[r.id] = {
      id: r.id,
      components: rows.map((c) => ({
        ingredientId: c.inventory_item_id,
        quantity: c.quantity,
        unit: requireUnit(units, c.unit_id, `recipe component ${c.id}`),
      })),
    }
  }

  return { ingredients, recipes }
}

/**
 * Resolve the recipe ids that make up a given item configuration: its base
 * recipe, the recipes for the selected variation options and unified modifier
 * options, and the recipes for the selected addons. All are matched by their
 * stable JSON ids.
 *
 * Unified modifier options are option deltas, so their recipes are returned in
 * `optionRecipeIds` alongside legacy variation options — one summed bucket, and
 * an unchanged return shape for existing callers. `selectedModifierOptionIds`
 * is last and optional so pre-existing call sites keep working untouched.
 */
export function resolveConfiguredRecipeIds(
  menuItemId: string,
  selectedOptionIds: readonly string[],
  selectedAddonIds: readonly string[],
  recipeRows: readonly Recipe[],
  selectedModifierOptionIds: readonly string[] = [],
): ConfiguredCostInput {
  const forItem = recipeRows.filter((r) => r.menu_item_id === menuItemId)

  const baseRecipeId = forItem.find((r) => r.target_type === 'menu_item')?.id ?? null

  const optionSet = new Set(selectedOptionIds)
  const modifierOptionSet = new Set(selectedModifierOptionIds)
  const optionRecipeIds = forItem
    .filter(
      (r) =>
        (r.target_type === 'variation_option' &&
          r.variation_option_id &&
          optionSet.has(r.variation_option_id)) ||
        (r.target_type === 'modifier_option' &&
          r.modifier_option_id &&
          modifierOptionSet.has(r.modifier_option_id)),
    )
    .map((r) => r.id)

  const addonSet = new Set(selectedAddonIds)
  const addonRecipeIds = forItem
    .filter((r) => r.target_type === 'addon' && r.addon_id && addonSet.has(r.addon_id))
    .map((r) => r.id)

  return { baseRecipeId, optionRecipeIds, addonRecipeIds }
}
