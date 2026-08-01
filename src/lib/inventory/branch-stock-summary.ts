/**
 * "Who has what, and who has run out?" — the owner's cross-branch view.
 *
 * This is the question the roll-up cannot answer. 700g of flour across the
 * chain reads as healthy whether it is split 350/350 or 700/0, and the second
 * case is a shop that cannot serve the dish, hidden inside a number that looks
 * fine. `inventory_items.current_qty` is the right headline for an owner and a
 * useless one for deciding anything.
 *
 * It is also the decision a transfer needs. Naming which branch to move FROM
 * and which to move TO is the useful half; naming a quantity is not, so this
 * deliberately does not invent one. A suggested figure would be obeyed rather
 * than judged, and the merchant is the one who knows what they can carry.
 *
 * Pure: nothing here queries, throws, or mutates its input.
 */

import { stockOnHandAt, rollUpOnHand, type BranchStockIndex } from '@/lib/inventory/stock-location'
import type { BranchStockLine, NamedBranch } from '@/lib/inventory/branch-stock-view'
import { branchStockBreakdown } from '@/lib/inventory/branch-stock-view'

/**
 * Quantities are NUMERIC(16,4), so anything under a ten-thousandth is
 * round-trip dust rather than stock — the same threshold `low-stock.ts` uses.
 * Reading dust as stock would keep an exhausted branch out of `emptyBranches`.
 */
const QUANTITY_EPSILON = 1e-4

/** Which way stock should move, when it obviously should. */
export interface BranchTransferSuggestion {
  fromOutletId: string
  fromName: string
  toOutletId: string
  toName: string
}

export interface BranchStockSummary {
  /** False for a single-shop store, whose rows should show no panel at all. */
  isMultiBranch: boolean
  /** What each branch holds. Empty when the store has one shop. */
  lines: BranchStockLine[]
  /** The chain total, including the unbranched pool. */
  total: number
  /** Branches holding nothing — the ones that cannot serve. */
  emptyBranches: BranchStockLine[]
  suggestion: BranchTransferSuggestion | null
}

const EMPTY: BranchStockSummary = {
  isMultiBranch: false,
  lines: [],
  total: 0,
  emptyBranches: [],
  suggestion: null,
}

/**
 * One ingredient, across every shop.
 *
 * The branch lines EXCLUDE the unbranched pool — that stock belongs to no shop,
 * and attributing it to one would tell a manager they hold something that is
 * not on their shelf. `total` INCLUDES it, so the figure keeps agreeing with
 * `inventory_items.current_qty` shown on the same screen; two totals that
 * disagreed would read as a bug in one of them.
 */
export function summarizeBranchStock(
  inventoryItemId: string,
  index: BranchStockIndex,
  branches: readonly NamedBranch[],
): BranchStockSummary {
  if (branches.length === 0) return { ...EMPTY, total: rollUpOnHand(index, inventoryItemId) }

  const lines = branchStockBreakdown(inventoryItemId, index, branches)
  const emptyBranches = lines.filter((line) => line.quantity <= QUANTITY_EPSILON)

  return {
    isMultiBranch: true,
    lines,
    total: rollUpOnHand(index, inventoryItemId),
    emptyBranches,
    suggestion: suggestTransfer(lines, emptyBranches),
  }
}

/**
 * Move from the branch with the most to the one with the least.
 *
 * Only when there is something to move and somewhere it is needed. Pointing at
 * a source that is itself empty would send a manager on an errand that cannot
 * succeed, so a chain that is out everywhere suggests nothing — that is a
 * purchasing problem, not a transfer.
 */
function suggestTransfer(
  lines: readonly BranchStockLine[],
  emptyBranches: readonly BranchStockLine[],
): BranchTransferSuggestion | null {
  if (emptyBranches.length === 0) return null

  const fullest = lines.reduce((best, line) => (line.quantity > best.quantity ? line : best))
  if (fullest.quantity <= QUANTITY_EPSILON) return null

  // The emptiest, so a chain with two empty shops names the worse one first.
  const emptiest = emptyBranches.reduce((worst, line) =>
    line.quantity < worst.quantity ? line : worst,
  )

  return {
    fromOutletId: fullest.outletId,
    fromName: fullest.name,
    toOutletId: emptiest.outletId,
    toName: emptiest.name,
  }
}

/** Re-exported so a caller needs one import for the whole cross-branch view. */
export { stockOnHandAt }
