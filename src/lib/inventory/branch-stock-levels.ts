/**
 * The store's ingredients, restated as one branch's ingredients.
 *
 * Every low-stock decision — crossings, recovery, the alert row itself — is
 * made from a `StockLevelInput`, and until now that input carried the chain
 * roll-up. A two-shop store with 700g of flour at North and none at South reads
 * as 700g, sails past every threshold, and nobody is told South cannot cook.
 * This is the one seam where that becomes a branch's question instead, so the
 * decisions downstream did not each have to learn about branches.
 *
 * The mirror of `applyBranchStock`, with one deliberate difference — see the
 * par level note below.
 */

import { stockOnHandAt, stockLocationKey, type BranchStockIndex } from '@/lib/inventory/stock-location'
import type { StockLevelInput } from '@/lib/inventory/low-stock'

/**
 * The items as this branch holds them.
 *
 * `outletId` is `undefined` for a caller with no branch to scope to — a
 * single-shop tenant, or a movement recorded without one. That returns the
 * caller's own array untouched, so today's behaviour is preserved exactly
 * rather than approximately. `null` is different: it is the unbranched store
 * pool, a real place with its own shelf.
 *
 * **The par level falls back to the store's, and `applyBranchStock` does not.**
 * That view reports what a merchant has configured, so inventing a threshold
 * would misreport their configuration. This decides whether to interrupt
 * someone, and the store-wide level is their standing answer to "tell me when
 * it gets this low". Without the fallback, turning branches on would silently
 * switch off every low-stock alert a tenant already depends on — and they would
 * find out by running out.
 *
 * A branch that has set its own level overrides the store's, in both
 * directions: a quiet shop is not nagged with a busy one's threshold.
 */
export function branchLevelInputs<T extends StockLevelInput>(
  items: readonly T[],
  index: BranchStockIndex,
  outletId: string | null | undefined,
): readonly T[] {
  if (outletId === undefined) return items

  const key = stockLocationKey(outletId)

  return items.map((item) => {
    const branchLevel = index.get(item.id)?.get(key)?.reorder_level ?? 0
    return {
      ...item,
      // No row means zero, never the roll-up: inheriting would tell a manager
      // with an empty shelf that they hold the whole chain's stock.
      current_qty: stockOnHandAt(index, item.id, outletId),
      reorder_level: branchLevel > 0 ? branchLevel : item.reorder_level,
    }
  })
}
