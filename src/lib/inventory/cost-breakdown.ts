/**
 * Per-target cost breakdown for a single menu item.
 *
 * Maps a tenant's `recipes` rows onto the costable targets of one menu item —
 * its base configuration, each variation option, each addon, and each unified
 * modifier option — and costs every one against the shared `CostingGraph`.
 *
 * Resilience matters here because this feeds a live editor: one malformed
 * recipe (a prep cycle, an ingredient deleted out from under a component) must
 * not blank out the costs of every other row. Failures are collected into
 * `errors` and reported, never swallowed.
 *
 * Pure module: no DB access, no server imports.
 */

import { computeRecipeCost, type CostingGraph } from '@/lib/inventory/costing'
import type { Recipe } from '@/types/database'

export interface MenuItemCostBreakdown {
  /** Cost of the item's base recipe; null when absent or broken. */
  baseCost: number | null
  /** Keyed by the stable JSON id of the legacy variation option. */
  variationOptionCosts: Record<string, number>
  /** Keyed by the stable JSON id of the legacy addon. */
  addonCosts: Record<string, number>
  /** Keyed by the stable JSON id of the unified modifier option. */
  modifierOptionCosts: Record<string, number>
  /** Human-readable diagnostics, one per recipe that could not be costed. */
  errors: string[]
}

function describeTarget(recipe: Recipe): string {
  const id =
    recipe.variation_option_id ?? recipe.addon_id ?? recipe.modifier_option_id ?? recipe.menu_item_id
  return `${recipe.target_type}${id ? ` "${id}"` : ''}`
}

export function computeMenuItemCostBreakdown(
  menuItemId: string,
  recipeRows: readonly Recipe[],
  graph: CostingGraph,
): MenuItemCostBreakdown {
  const breakdown: MenuItemCostBreakdown = {
    baseCost: null,
    variationOptionCosts: {},
    addonCosts: {},
    modifierOptionCosts: {},
    errors: [],
  }

  for (const recipe of recipeRows) {
    if (recipe.menu_item_id !== menuItemId) continue

    let cost: number
    try {
      cost = computeRecipeCost(recipe.id, graph)
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown costing error'
      breakdown.errors.push(`Could not cost ${describeTarget(recipe)}: ${reason}`)
      continue
    }

    if (recipe.target_type === 'menu_item') {
      breakdown.baseCost = cost
    } else if (recipe.target_type === 'variation_option' && recipe.variation_option_id) {
      breakdown.variationOptionCosts[recipe.variation_option_id] = cost
    } else if (recipe.target_type === 'addon' && recipe.addon_id) {
      breakdown.addonCosts[recipe.addon_id] = cost
    } else if (recipe.target_type === 'modifier_option' && recipe.modifier_option_id) {
      breakdown.modifierOptionCosts[recipe.modifier_option_id] = cost
    }
  }

  return breakdown
}
