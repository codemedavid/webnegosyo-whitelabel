/**
 * How a store's orders divide across the places they were taken.
 *
 * `getSalesAnalytics` used to answer this with two hand-counted numbers, web
 * and mobile, which quietly excluded the register, the QR table handoff and
 * anything else `source` may hold. The grouping lives here so it is one
 * expression with a test rather than two filters inside a query handler.
 */

export interface ChannelOrder {
  source?: string;
  total: number;
  status: string;
}

export interface OrderChannelCount {
  /** Raw `orders.source`; "" when the order recorded none. */
  source: string;
  /** Every order in the window, cancelled ones included, so the counts sum to totalOrders. */
  count: number;
  /** Takings excluding cancelled orders, matching totalRevenue. */
  revenue: number;
}

export function summarizeOrderChannels(
  orders: readonly ChannelOrder[]
): OrderChannelCount[] {
  const channels = new Map<string, { count: number; revenue: number }>();

  for (const order of orders) {
    const source = order.source ?? "";
    const existing = channels.get(source) ?? { count: 0, revenue: 0 };
    channels.set(source, {
      count: existing.count + 1,
      revenue: existing.revenue + (order.status === "cancelled" ? 0 : order.total),
    });
  }

  // Busiest channel first; ties keep the order they were first seen in, which
  // makes the list stable between refreshes.
  return Array.from(channels.entries())
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.count - a.count);
}
