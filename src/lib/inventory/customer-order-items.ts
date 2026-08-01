/**
 * Turns an order's own saved lines back into depletion items.
 *
 * The white-labeled customer app writes its orders directly to the platform
 * `orders` table and never passes through `createOrderAction`, the one place
 * order-driven depletion is wired — so those orders have been spending nothing.
 *
 * The route built on this takes NO item data from its caller. A diner has no
 * account, so it cannot be gated on a session the way the merchant app's stock
 * routes are; the guard is that there is nothing in the payload to steer. Every
 * dish and quantity comes from the order the platform already holds.
 */

import type { DepletionOrderItem } from '@/lib/inventory/order-depletion'

/** One saved order line, as narrow as this needs it. */
export interface OrderItemRow {
  menu_item_id: string | null
  quantity: number
}

export function buildDepletionItemsFromOrderRows(
  rows: readonly OrderItemRow[],
): DepletionOrderItem[] {
  // Lines are never merged: two configurations of one dish spend different
  // ingredients, so each is resolved against its own recipes.
  return rows.flatMap((row) => {
    // A deleted dish leaves the name behind and the id null. Nothing can be
    // spent for it, and there is nothing safe to guess.
    if (typeof row.menu_item_id !== 'string' || row.menu_item_id === '') return []

    const quantity = Number(row.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return []

    // No option ids: nothing persists them on an order, and accepting them from
    // the caller is exactly what this design refuses. Base recipes deplete —
    // strictly more than the nothing this path spent before.
    return [{ menuItemId: row.menu_item_id, quantity }]
  })
}
