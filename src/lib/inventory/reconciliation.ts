/**
 * Stock ledger reconciliation.
 *
 * `inventory_items.current_qty` is the store-wide roll-up; `inventory_stock`
 * holds the per-branch split, and a trigger keeps the roll-up equal to the sum
 * of its branch rows. The two can therefore only disagree through drift — a bug
 * or a write that bypassed the trigger — which used to be invisible.
 *
 * The check is deliberately cheap (one read per table) and deliberately
 * conservative: an item with NO branch rows has never been split by the
 * trigger, so it has nothing to disagree with and is in sync by definition.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface StockReconciliationIssue {
  itemId: string
  name: string
  rollupQty: number
  branchSumQty: number
}

interface RollupItem {
  id: string
  name: string
  current_qty: number
}

interface BranchStockRow {
  inventory_item_id: string
  current_qty: number
}

/** Float noise from summing branch rows must not read as drift. */
const QTY_EPSILON = 1e-6

/**
 * Pure comparison: which items' roll-up disagrees with their branch sum.
 * Items with no branch rows at all are skipped — nothing to compare against.
 */
export function compareStockRollups(
  items: ReadonlyArray<RollupItem>,
  stockRows: ReadonlyArray<BranchStockRow>,
): StockReconciliationIssue[] {
  if (items.length === 0 || stockRows.length === 0) return []

  const sumByItemId = new Map<string, number>()
  for (const row of stockRows) {
    sumByItemId.set(
      row.inventory_item_id,
      (sumByItemId.get(row.inventory_item_id) ?? 0) + row.current_qty,
    )
  }

  return items.flatMap((item) => {
    const branchSumQty = sumByItemId.get(item.id)
    if (branchSumQty === undefined) return []
    if (Math.abs(item.current_qty - branchSumQty) <= QTY_EPSILON) return []
    return [{ itemId: item.id, name: item.name, rollupQty: item.current_qty, branchSumQty }]
  })
}

/**
 * The drifted items for a tenant, or `null` when the read failed.
 *
 * Never throws: this renders on the admin inventory page, and a failed
 * diagnostic must not take the screen it diagnoses down with it. Null is
 * distinct from "no issues" — the caller simply shows nothing either way,
 * which is honest about having no verdict.
 */
export async function getStockReconciliationIssues(
  tenantId: string,
): Promise<StockReconciliationIssue[] | null> {
  try {
    const supabase = createAdminClient()

    const [itemsResult, stockResult] = await Promise.all([
      supabase.from('inventory_items').select('id, name, current_qty').eq('tenant_id', tenantId),
      supabase
        .from('inventory_stock')
        .select('inventory_item_id, current_qty')
        .eq('tenant_id', tenantId),
    ])
    if (itemsResult.error) throw itemsResult.error
    if (stockResult.error) throw stockResult.error

    return compareStockRollups(
      (itemsResult.data ?? []) as unknown as RollupItem[],
      (stockResult.data ?? []) as unknown as BranchStockRow[],
    )
  } catch (error) {
    console.error('[inventory] Stock reconciliation read failed', { tenantId, error })
    return null
  }
}
