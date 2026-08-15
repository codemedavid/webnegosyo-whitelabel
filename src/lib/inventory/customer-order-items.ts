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

/**
 * The Convex-tenant twin of the above. Those tenants hold their orders in a
 * per-tenant Convex deployment, not the platform `orders` table — but the trust
 * boundary is identical: the caller still names only a tenant and an order, and
 * the platform reads the lines back out of the deployment server-side with the
 * deploy key only it holds.
 *
 * No name→id resolution is needed: every writer of Convex `orderItems` (web
 * checkout, the branded app, POS) stamps `menuItemId` with the platform menu
 * item id (`String(item.menu_item.id)`), so the stored id resolves against
 * recipes directly. An id that resolves to nothing simply spends nothing.
 *
 * Rows are `unknown` on purpose — this is an HTTP response from an external
 * deployment, and a malformed row must drop, never throw.
 */
export function buildDepletionItemsFromConvexOrderItems(
  rows: readonly unknown[],
): DepletionOrderItem[] {
  // Lines are never merged, for the same reason as the platform path: two
  // configurations of one dish spend different ingredients.
  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []

    const { menuItemId, quantity: rawQuantity } = row as {
      menuItemId?: unknown
      quantity?: unknown
    }
    if (typeof menuItemId !== 'string' || menuItemId === '') return []

    const quantity = Number(rawQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return []

    return [{ menuItemId, quantity }]
  })
}
