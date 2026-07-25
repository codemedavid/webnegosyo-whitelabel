/**
 * Costing read path — the bridge between persisted inventory rows and the pure
 * costing core.
 *
 * A tenant's units, ingredients, recipes, and recipe components are loaded once
 * per call and projected into an in-memory `CostingGraph`. Everything after the
 * fetch is pure, so the interesting behavior is testable without a database.
 *
 * The row fetch is injectable (see `CostingFetchDeps`), mirroring
 * `TenantOrderWriteDeps` in `tenant-supabase-orders.ts`. Production callers omit
 * the argument and get the Supabase-backed default.
 *
 * Reads are `cache()`-wrapped per request: a page that costs several items
 * loads the tenant's inventory once rather than once per item.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { buildCostingGraph } from '@/lib/inventory/graph-builder'
import { computeMenuItemCostBreakdown, type MenuItemCostBreakdown } from '@/lib/inventory/cost-breakdown'
import type { CostingGraph } from '@/lib/inventory/costing'
import type {
  InventoryItem,
  InventoryUnitRow,
  Recipe,
  RecipeComponent,
} from '@/types/database'

export interface CostingRowSets {
  units: InventoryUnitRow[]
  items: InventoryItem[]
  recipes: Recipe[]
  components: RecipeComponent[]
}

export interface CostingFetchDeps {
  fetchCostingRows: (tenantId: string) => Promise<CostingRowSets>
}

/**
 * Load every costing-relevant row for a tenant in one round of parallel reads.
 * Errors are thrown, never coerced into empty sets — an empty graph would show
 * a confident ₱0 cost for every item, which is worse than a visible failure.
 */
const fetchCostingRowsFromSupabase = cache(async (tenantId: string): Promise<CostingRowSets> => {
  const supabase = await createClient()

  const [units, items, recipes, components] = await Promise.all([
    supabase.from('inventory_units').select('*').eq('tenant_id', tenantId),
    supabase.from('inventory_items').select('*').eq('tenant_id', tenantId),
    supabase.from('recipes').select('*').eq('tenant_id', tenantId),
    supabase.from('recipe_components').select('*').eq('tenant_id', tenantId),
  ])

  if (units.error) throw units.error
  if (items.error) throw items.error
  if (recipes.error) throw recipes.error
  if (components.error) throw components.error

  return {
    units: (units.data ?? []) as unknown as InventoryUnitRow[],
    items: (items.data ?? []) as unknown as InventoryItem[],
    recipes: (recipes.data ?? []) as unknown as Recipe[],
    components: (components.data ?? []) as unknown as RecipeComponent[],
  }
})

const defaultDeps: CostingFetchDeps = { fetchCostingRows: fetchCostingRowsFromSupabase }

/** In-memory costing graph for a tenant. */
export async function getCostingGraph(
  tenantId: string,
  deps: CostingFetchDeps = defaultDeps,
): Promise<CostingGraph> {
  const rows = await deps.fetchCostingRows(tenantId)
  return buildCostingGraph(rows.units, rows.items, rows.recipes, rows.components)
}

/**
 * Recipe-derived cost of one menu item's targets: its base configuration, each
 * variation option, each addon, and each unified modifier option. A recipe that
 * cannot be costed lands in `errors` without taking the other targets down.
 */
export async function getMenuItemCost(
  tenantId: string,
  menuItemId: string,
  deps: CostingFetchDeps = defaultDeps,
): Promise<MenuItemCostBreakdown> {
  const rows = await deps.fetchCostingRows(tenantId)
  const graph = buildCostingGraph(rows.units, rows.items, rows.recipes, rows.components)
  return computeMenuItemCostBreakdown(menuItemId, rows.recipes, graph)
}
