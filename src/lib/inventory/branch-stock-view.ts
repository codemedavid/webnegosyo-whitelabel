/**
 * Seeing and moving stock as one branch rather than as the whole chain.
 *
 * `inventory_items.current_qty` is the roll-up — the sum of every branch. That
 * is the owner's number and every existing screen already shows it. A branch
 * manager shown the same figure is being told about stock sitting in a shop
 * they cannot reach, and would count their own shelf as short against it.
 *
 * The branch quantity is written back onto the item's own `current_qty` and
 * `reorder_level` fields rather than exposed as a parallel shape, exactly as
 * `applyOutletMenuOverrides` writes a branch price back onto `price`. Every
 * consumer downstream — `buildInventoryRows`, `evaluateStockLevel`, the CSV
 * export, the merchant app — then keeps working untouched: the branch is
 * applied at one seam instead of at every call site.
 *
 * Nothing here queries or mutates its input. `resolveMovementBranch` is the one
 * function that throws, following `resolveStaffOutletId`: it validates an
 * untrusted choice and its message is meant for the person who made it.
 */

import type { BranchScope } from '@/lib/outlets/branch-scope'
import { stockOnHandAt, type BranchStockIndex } from '@/lib/inventory/stock-location'

/** The item fields a branch replaces. Anything else passes through. */
export interface BranchStockableItem {
  id: string
  current_qty: number
  reorder_level: number
}

/**
 * The items as this account should see them.
 *
 * A store-wide account gets the caller's own array back rather than a copy: it
 * is by far the common case and copying every row to change nothing is waste —
 * the same trade `filterOrdersToScope` makes.
 *
 * An ingredient this branch has never stocked resolves to zero, never to the
 * roll-up. Falling back would tell a manager with an empty shelf that they hold
 * the whole chain's stock, and the dish would stay on sale. It stays in the
 * list, though: dropping it would hide the ingredient from the branch's own
 * catalogue and make it un-receivable, so the manager could never get their
 * first delivery of it onto the shelf.
 */
export function applyBranchStock<T extends BranchStockableItem>(
  items: readonly T[],
  index: BranchStockIndex,
  scope: BranchScope,
): readonly T[] {
  if (scope.kind === 'all') return items

  return items.map((item) => {
    const row = index.get(item.id)?.get(scope.outletId)
    return {
      ...item,
      current_qty: stockOnHandAt(index, item.id, scope.outletId),
      // The branch's own par level, or none. Inheriting the store-wide level
      // would nag a quiet shop with a busy one's threshold.
      reorder_level: row?.reorder_level ?? 0,
    }
  })
}

/** A branch as the owner's breakdown names it. */
export interface NamedBranch {
  id: string
  name: string
}

/** What one shop holds, for the owner's cross-branch view. */
export interface BranchStockLine {
  outletId: string
  name: string
  quantity: number
}

/**
 * What every shop is holding of one ingredient.
 *
 * A branch holding nothing is listed with zero rather than omitted: "South has
 * none" is the most useful thing this view can say, an absent row reads as "no
 * data", and it is precisely the branch a transfer should target.
 */
export function branchStockBreakdown(
  inventoryItemId: string,
  index: BranchStockIndex,
  branches: readonly NamedBranch[],
): BranchStockLine[] {
  return branches.map((branch) => ({
    outletId: branch.id,
    name: branch.name,
    quantity: stockOnHandAt(index, inventoryItemId, branch.id),
  }))
}

/**
 * The branch a manual movement is allowed to land in.
 *
 * The owner chooses — receiving a delivery into North is an ordinary thing to
 * do from the store-wide screen — and may choose the unbranched pool, which is
 * what every single-location tenant uses.
 *
 * A branch manager is pinned to their own branch whatever they ask for, and
 * naming another shop is refused rather than quietly redirected: a manager who
 * believes they just received 20kg into South should be told they did not.
 * Leaving their movement unbranched would be just as wrong — it would vanish
 * from their own screen the moment it was recorded.
 *
 * This is the application half of the guard. The other half is the
 * `inventory_stock` / `stock_movements` RLS policy, which is what stops a
 * caller who skips the server action.
 */
export function resolveMovementBranch(
  requestedOutletId: string | null | undefined,
  scope: BranchScope,
): string | null {
  const requested = typeof requestedOutletId === 'string' ? requestedOutletId.trim() : ''

  if (scope.kind === 'all') return requested === '' ? null : requested

  if (requested !== '' && requested !== scope.outletId) {
    throw new Error('You can only move stock at your own branch')
  }

  return scope.outletId
}
