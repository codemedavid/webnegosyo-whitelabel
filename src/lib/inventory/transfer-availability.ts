/**
 * What a branch can actually put on a van.
 *
 * The database has the final say: `apply_stock_movement()` refuses a leg that
 * would take a shelf below what is on it. That refusal fires at *send*, though,
 * which is the end of the composing job rather than the start of it — so this
 * module answers the same question early enough for the answer to be useful.
 *
 * Nothing here is a security boundary. A merchant who gets past it still meets
 * the trigger, and the trigger is what protects the stock. This only stops
 * someone drafting a transfer they were always going to be refused.
 *
 * The question is always asked of the SOURCE BRANCH, never the store. The
 * roll-up on `inventory_items.current_qty` is the number that would happily
 * report a chain's 700g of flour as sendable from a shop holding 40 of it.
 */

import { stockOnHandAt, type BranchStockIndex } from '@/lib/inventory/stock-location'

/**
 * Quantities are NUMERIC(16,4), so anything under a ten-thousandth is
 * round-trip dust. Treating it as stock would offer an exhausted ingredient;
 * treating it as an over-draft would refuse a legitimate "send it all".
 */
const QUANTITY_EPSILON = 1e-4

/** The ingredient fields the picker needs to name a line. */
export interface TransferStockableIngredient {
  id: string
  name: string
  unit: string
}

export interface AvailableIngredient extends TransferStockableIngredient {
  /** What the source branch is holding, in the ingredient's stock unit. */
  onHand: number
}

/** A drafted line, before it is a transfer. */
export interface DraftedQuantity {
  inventoryItemId: string
  quantity: number
}

/**
 * The ingredients this branch could send, with what it holds of each.
 *
 * Anything the branch holds none of is dropped rather than listed at zero.
 * That is deliberately the opposite of `applyBranchStock`, which keeps a zero
 * ingredient in the catalogue so a manager can receive their first delivery of
 * it: a shelf with nothing on it is a thing you can put stock ON, and not a
 * thing you can take stock OFF.
 *
 * Negative on-hand is dropped for the same reason. It means a sale was recorded
 * before its delivery, and there is still nothing physically there to load.
 */
export function ingredientsAvailableAt(
  ingredients: readonly TransferStockableIngredient[],
  index: BranchStockIndex,
  outletId: string | null,
): AvailableIngredient[] {
  return ingredients
    .map((ingredient) => ({ ...ingredient, onHand: stockOnHandAt(index, ingredient.id, outletId) }))
    .filter((ingredient) => ingredient.onHand > QUANTITY_EPSILON)
}

/**
 * The drafted lines asking for more than the source branch holds.
 *
 * Returns ids rather than a boolean so the screen can point at the line that is
 * wrong. "Something in this transfer is too big" makes the merchant re-check
 * every row they typed.
 */
export function overDraftedItemIds(
  lines: readonly DraftedQuantity[],
  index: BranchStockIndex,
  outletId: string | null,
): string[] {
  return lines
    .filter((line) => line.quantity - stockOnHandAt(index, line.inventoryItemId, outletId) > QUANTITY_EPSILON)
    .map((line) => line.inventoryItemId)
}
