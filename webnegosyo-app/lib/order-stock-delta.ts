/**
 * The inventory movement an order edit has to make.
 *
 * Placing the order already depleted stock, so an edit moves only the
 * DIFFERENCE. Re-depleting the whole order, or forgetting to restore a removed
 * item, silently corrupts every count downstream — and stock corruption is
 * invisible until someone sells something they do not have.
 *
 * Grouping is by MENU ITEM, not by order line: swapping a Small Latte for a
 * Large one is two different lines to the kitchen but the same item to the
 * stock ledger, so it must net to zero.
 *
 * Pure and side-effect free.
 */

import type { RevisedOrderItem } from "./order-edit-cart";

export interface StockMovement {
  menuItemId: string;
  /** Positive depletes further; negative puts stock back. */
  quantityDelta: number;
}

/** Total units per menu item, ignoring how they were configured. */
function unitsByMenuItem(items: readonly RevisedOrderItem[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of items) {
    // A menu item deleted after the sale leaves nothing to move stock against.
    if (!item.menuItemId) continue;
    totals.set(item.menuItemId, (totals.get(item.menuItemId) ?? 0) + item.quantity);
  }

  return totals;
}

/** The net stock movement to apply when saving a revision. */
export function stockDelta(
  before: readonly RevisedOrderItem[],
  after: readonly RevisedOrderItem[],
): StockMovement[] {
  const beforeUnits = unitsByMenuItem(before);
  const afterUnits = unitsByMenuItem(after);
  const menuItemIds = new Set([...beforeUnits.keys(), ...afterUnits.keys()]);

  const movements: StockMovement[] = [];

  for (const menuItemId of menuItemIds) {
    const quantityDelta = (afterUnits.get(menuItemId) ?? 0) - (beforeUnits.get(menuItemId) ?? 0);
    if (quantityDelta === 0) continue;

    movements.push({ menuItemId, quantityDelta });
  }

  return movements;
}
