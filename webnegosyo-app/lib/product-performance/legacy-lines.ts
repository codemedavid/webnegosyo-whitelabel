/**
 * Sold lines for a store whose backend has no `analytics:getItemSales` — every
 * Convex store — built on the phone from the two reads both backends have
 * always served: the window's orders and their line items.
 */

import type { LineAddon, LineSelection, SalesLine } from "./types";

export interface LegacyOrder {
  _id: string;
  _creationTime: number;
  /** When an offline register sale actually happened; wins over insertion time. */
  saleOccurredAt?: number;
  status: string;
  source?: string;
}

export interface LegacyItem {
  orderId: string;
  menuItemId: string | null;
  menuItemName: string;
  quantity: number;
  subtotal: number;
  variation?: string;
  variationSelections?: readonly LineSelection[];
  addons?: readonly LineAddon[];
}

interface JoinOptions {
  window: { startMs: number; endMs: number };
  menuItemId?: string;
}

export function joinLegacyLines(
  orders: readonly LegacyOrder[] | undefined,
  items: readonly LegacyItem[] | undefined,
  { window, menuItemId }: JoinOptions
): SalesLine[] {
  if (!orders || !items) return [];

  const liveOrders = new Map<string, { at: number; source?: string }>();
  for (const order of orders) {
    const at = order.saleOccurredAt ?? order._creationTime;
    if (order.status === "cancelled" || at < window.startMs || at >= window.endMs) continue;
    liveOrders.set(order._id, { at, source: order.source });
  }

  return items.flatMap((item) => {
    const order = liveOrders.get(item.orderId);
    if (!order || !item.menuItemId) return [];
    if (menuItemId && item.menuItemId !== menuItemId) return [];
    return [
      {
        orderId: item.orderId,
        createdAtMs: order.at,
        source: order.source,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: item.quantity,
        subtotal: item.subtotal,
        variation: item.variation,
        variationSelections: item.variationSelections,
        addons: item.addons,
      },
    ];
  });
}

/**
 * From when the lines a read returned can be trusted to be complete.
 *
 * Both backends read newest first, so a read that hit its cap lost its OLDEST
 * lines: the days before the oldest line that arrived are unknown, and must
 * not be shown as quiet days or used as a comparison baseline.
 */
export function coverageStartMs(
  lines: readonly Pick<SalesLine, "createdAtMs">[],
  isTruncated: boolean,
  requestedStartMs: number
): number {
  if (!isTruncated || lines.length === 0) return requestedStartMs;
  return lines.reduce((oldest, line) => Math.min(oldest, line.createdAtMs), Number.POSITIVE_INFINITY);
}
