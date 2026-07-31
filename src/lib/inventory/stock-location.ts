/**
 * Where stock physically is, once a store has more than one shop.
 *
 * `inventory_items.current_qty` was a single scalar per tenant, so every branch
 * drew on the same number: a sale at North depleted the flour at South. Stock
 * now lives one row per (item, branch) in `inventory_stock`, and this module is
 * the pure arithmetic over those rows — what one branch holds, and what the
 * whole store holds.
 *
 * **The rule that separates this from `outlet-menu-overrides`.** That table is
 * an override table, so a missing row means "use the store-wide value". Stock
 * is the opposite: a missing row means ZERO. A price is a setting that a branch
 * either restates or inherits; a quantity is a physical fact about one shelf,
 * and inheriting it would report the same sack of flour as present at every
 * branch at once and make the roll-up count it twice.
 *
 * Nothing here queries, throws, or mutates its input. The web admin, the
 * merchant app and the POS all have to reach the same on-hand number, and
 * `branch-scope.ts` and `staff-permissions.ts` already established that a
 * question three surfaces ask gets answered once, in a module they share.
 */

/** The `inventory_stock` columns an on-hand answer depends on. */
export interface BranchStockRow {
  inventory_item_id: string
  /** NULL = the unbranched store pool. */
  outlet_id: string | null
  current_qty: number
  reorder_level: number
}

/**
 * Key standing in for "no branch" inside the index.
 *
 * A `Map` cannot key on null and mean it distinctly from a branch that happens
 * to be missing, so the unbranched pool gets a name no UUID can collide with.
 */
export const STORE_POOL_KEY = '__store__'

/** Item id → branch key → that branch's stock row. */
export type BranchStockIndex = ReadonlyMap<string, ReadonlyMap<string, BranchStockRow>>

/**
 * The index key for a branch, or the store pool when there isn't one.
 *
 * A blank id reads as the store pool rather than as a branch literally named
 * "", matching `resolveBranchScope`. Stock must not land in a branch that
 * cannot be looked up again.
 */
export function stockLocationKey(outletId: string | null | undefined): string {
  const trimmed = typeof outletId === 'string' ? outletId.trim() : ''
  return trimmed === '' ? STORE_POOL_KEY : trimmed
}

/** Index stock rows for repeated per-item, per-branch lookup. */
export function indexStockRows(rows: readonly BranchStockRow[]): BranchStockIndex {
  const index = new Map<string, Map<string, BranchStockRow>>()

  for (const row of rows) {
    let byBranch = index.get(row.inventory_item_id)
    if (!byBranch) {
      byBranch = new Map<string, BranchStockRow>()
      index.set(row.inventory_item_id, byBranch)
    }
    byBranch.set(stockLocationKey(row.outlet_id), row)
  }

  return index
}

/**
 * What one branch is holding of one ingredient.
 *
 * Zero when that branch has no row — see the module note. Negative quantities
 * pass through untouched: stock goes negative when a sale lands before its
 * delivery is recorded, and clamping would hide exactly the discrepancy the
 * ledger exists to surface.
 */
export function stockOnHandAt(
  index: BranchStockIndex,
  inventoryItemId: string,
  outletId: string | null | undefined,
): number {
  const row = index.get(inventoryItemId)?.get(stockLocationKey(outletId))
  return row?.current_qty ?? 0
}

/**
 * What the whole store is holding of one ingredient, across every branch.
 *
 * This is the owner's number, and the invariant the database trigger maintains
 * on `inventory_items.current_qty`: the roll-up equals the sum of its branches.
 * The unbranched pool is part of that sum — stock received before the store
 * opened a second branch still sits there, and excluding it would make the
 * owner's total drop on the day branches were switched on.
 */
export function rollUpOnHand(index: BranchStockIndex, inventoryItemId: string): number {
  const byBranch = index.get(inventoryItemId)
  if (!byBranch) return 0

  let total = 0
  for (const row of byBranch.values()) {
    total += row.current_qty
  }
  return total
}
