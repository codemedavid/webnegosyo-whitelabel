/**
 * Reading stock as the account looking at it.
 *
 * `branch-stock-view.ts` holds the arithmetic; this is the read that feeds it,
 * and the one every admin surface should call instead of `getIngredients`.
 *
 * It goes through the RLS-enforcing server client, like `getOpenStockAlerts`
 * and unlike the order pipeline's service-role writes. That matters twice now:
 * the `inventory_stock` policy is branch-scoped (migration 20260809120000), so
 * a branch manager's own query already returns only their branch's rows before
 * `applyBranchStock` narrows anything.
 */

import { createClient } from '@/lib/supabase/server'
import { getIngredients } from '@/lib/inventory/ingredients-service'
import { applyBranchStock } from '@/lib/inventory/branch-stock-view'
import {
  indexStockRows,
  type BranchStockIndex,
  type BranchStockRow,
} from '@/lib/inventory/stock-location'
import type { BranchScope } from '@/lib/outlets/branch-scope'
import type { NamedBranch } from '@/lib/inventory/branch-stock-view'
import {
  summarizeBranchStock,
  type BranchStockSummary,
} from '@/lib/inventory/branch-stock-summary'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import type { InventoryItem } from '@/types/database'

export type { BranchStockSummary }

const EMPTY_INDEX: BranchStockIndex = new Map()

/**
 * Every per-branch stock row this tenant has, indexed by item and branch.
 *
 * Returns an empty index rather than throwing: this renders inside the
 * inventory page, and a failed stock read must not take the whole screen down.
 * What an empty index *means* to a caller is decided by `applyBranchStock` —
 * an owner keeps their roll-up, a branch sees zero.
 */
export async function getBranchStockIndex(tenantId: string): Promise<BranchStockIndex> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('inventory_stock')
      .select('inventory_item_id, outlet_id, current_qty, reorder_level')
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[inventory] Branch stock read failed', tenantId, error)
      return EMPTY_INDEX
    }

    return indexStockRows((data ?? []) as unknown as BranchStockRow[])
  } catch (error) {
    console.error('[inventory] Branch stock read failed', tenantId, error)
    return EMPTY_INDEX
  }
}

/**
 * The tenant's ingredients, with quantities as this account should see them.
 *
 * A store-wide account gets `inventory_items` untouched — `current_qty` is
 * already the roll-up across every branch, which is the owner's number.
 *
 * A branch account gets its own branch's figures, and **zero** for anything its
 * branch does not hold. That includes the case where the stock read failed:
 * showing a branch the chain total would invite them to sell stock they do not
 * have, while zero shows an empty shelf — visibly wrong rather than invisibly
 * wrong, and recoverable by reloading.
 */
/**
 * The cross-branch view for every ingredient, keyed by ingredient id.
 *
 * A plain record rather than a Map because this crosses the server-to-client
 * boundary into `InventoryManager`, and a Map would have to be rebuilt there
 * for no gain — the same reasoning `lastPurchaseByItemId` already follows.
 *
 * Empty for a single-shop store: `summarizeBranchStock` reports
 * `isMultiBranch: false` and the panel renders nothing, so there is no point
 * shipping a record of empties to the majority of tenants.
 */
export async function getBranchStockSummaries(
  tenantId: string,
  inventoryItemIds: readonly string[],
): Promise<Record<string, BranchStockSummary>> {
  let branches: NamedBranch[]
  try {
    const outlets = await createSupabaseOutletRepository().listByTenant(tenantId)
    branches = outlets
      .filter((outlet) => outlet.is_active)
      .map((outlet) => ({ id: outlet.id, name: outlet.name }))
  } catch (error) {
    // The panel is an extra on a page that already works. A failed branch read
    // must not take the inventory screen down with it.
    console.error('[inventory] Branch list read failed', tenantId, error)
    return {}
  }

  if (branches.length === 0) return {}

  const index = await getBranchStockIndex(tenantId)
  return Object.fromEntries(
    inventoryItemIds.map((id) => [id, summarizeBranchStock(id, index, branches)]),
  )
}

export async function getScopedIngredients(
  tenantId: string,
  scope: BranchScope,
): Promise<InventoryItem[]> {
  const ingredients = await getIngredients(tenantId)
  if (scope.kind === 'all') return ingredients

  const index = await getBranchStockIndex(tenantId)
  return applyBranchStock(ingredients, index, scope) as InventoryItem[]
}
