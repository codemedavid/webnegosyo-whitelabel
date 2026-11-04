/**
 * Pure ports of the `analytics:*` queries in `convex-template/convex/analytics.ts`.
 *
 * On Convex these run server-side over the deployment's tables. A platform-
 * backend store has no deployment, so `supabase-analytics.ts` fetches the same
 * rows from the shared database and hands them here. Keeping the arithmetic
 * identical — same exclusions, same rounding, same local-day bucketing — is
 * what makes a merchant's figures the same on both backends. Nothing in this
 * file reads a clock or a client; the caller has already applied the window.
 */

import { localDateKey, localDayOfWeek, localHour } from "./analytics-time";
import { MIDNIGHT_SCHEDULE, tradingDayOf, type CutoffSchedule } from "../business-day/trading-day";
import { resolveOrderIdentityKey } from "../customer-identity";
import { orderMethodSlices, type AnalyticsPayment, type MethodSlice } from "./analytics-payment-slices";

export type { AnalyticsPayment } from "./analytics-payment-slices";

export interface AnalyticsOrder {
  id: string;
  createdAtMs: number;
  status: string;
  total: number;
  source?: string;
  orderType?: string;
  paymentMethod?: string;
  /**
   * The order's settlement ledger, when the caller read it. A bill paid with
   * several methods is split between them by these; without them the whole
   * total counts under `paymentMethod`.
   */
  payments?: readonly AnalyticsPayment[];
  customerName: string;
  customerContact: string;
  customerData: unknown;
}

export interface AnalyticsItem {
  orderId: string;
  menuItemId: string | null;
  menuItemName: string;
  quantity: number;
  subtotal: number;
  isUpsellItem: boolean;
}

export interface AnalyticsEvent {
  type: string;
  createdAtMs: number;
}

const UNKNOWN = "Unknown";
const TOP_CUSTOMERS = 10;

function isCancelled(order: AnalyticsOrder): boolean {
  return order.status === "cancelled";
}

function countOf(events: readonly AnalyticsEvent[], type: string): number {
  return events.filter((e) => e.type === type).length;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function sortedByRevenue<T extends { revenue: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}

// --- upsell / bundle ---------------------------------------------------------

export function computeUpsellAnalytics(events: readonly AnalyticsEvent[]) {
  const shown = countOf(events, "upsell_shown");
  const clicked = countOf(events, "upsell_clicked");
  const converted = countOf(events, "upsell_converted");
  return {
    shown,
    clicked,
    converted,
    clickRate: ratio(clicked, shown),
    conversionRate: ratio(converted, shown),
  };
}

export function computeBundleAnalytics(events: readonly AnalyticsEvent[]) {
  const viewed = countOf(events, "bundle_viewed");
  const added = countOf(events, "bundle_added");
  return { viewed, added, conversionRate: ratio(added, viewed) };
}

export function computeUpsellTrends(
  events: readonly AnalyticsEvent[],
  items: readonly AnalyticsItem[]
) {
  const daily = new Map<string, { shown: number; converted: number }>();
  for (const e of events) {
    if (e.type !== "upsell_shown" && e.type !== "upsell_converted") continue;
    const date = localDateKey(e.createdAtMs);
    const bucket = daily.get(date) ?? { shown: 0, converted: 0 };
    daily.set(date, {
      shown: bucket.shown + (e.type === "upsell_shown" ? 1 : 0),
      converted: bucket.converted + (e.type === "upsell_converted" ? 1 : 0),
    });
  }

  const dailyRates = Array.from(daily.entries())
    .map(([date, d]) => ({ date, rate: ratio(d.converted, d.shown) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalUpsellRevenue = items
    .filter((i) => i.isUpsellItem)
    .reduce((sum, i) => sum + i.subtotal, 0);

  return { dailyRates, totalUpsellRevenue };
}

// --- items --------------------------------------------------------------------

/** `items` must already be the lines of non-cancelled orders in the window. */
export function computeTopItems(items: readonly AnalyticsItem[], limit: number) {
  const byItem = new Map<string, { name: string; count: number; revenue: number }>();
  for (const item of items) {
    if (!item.menuItemId) continue;
    const existing = byItem.get(item.menuItemId) ?? { name: item.menuItemName, count: 0, revenue: 0 };
    byItem.set(item.menuItemId, {
      name: existing.name,
      count: existing.count + item.quantity,
      revenue: existing.revenue + item.subtotal,
    });
  }
  return sortedByRevenue(
    Array.from(byItem.entries()).map(([itemId, d]) => ({ itemId, ...d }))
  ).slice(0, limit);
}

// --- orders -------------------------------------------------------------------

/**
 * Revenue per day. With a business-day `schedule` a day is the store's
 * business day (a 1 AM sale on a 4 AM store is the night before's); without
 * one it is the Manila calendar date, as before.
 */
export function computeTrends(orders: readonly AnalyticsOrder[], schedule: CutoffSchedule = MIDNIGHT_SCHEDULE) {
  const byDay = new Map<string, { totalOrders: number; totalRevenue: number }>();
  for (const order of orders) {
    if (isCancelled(order)) continue;
    const date =
      schedule.length === 0
        ? localDateKey(order.createdAtMs)
        : tradingDayOf(new Date(order.createdAtMs).toISOString(), schedule);
    const d = byDay.get(date) ?? { totalOrders: 0, totalRevenue: 0 };
    byDay.set(date, { totalOrders: d.totalOrders + 1, totalRevenue: d.totalRevenue + order.total });
  }
  return Array.from(byDay.entries())
    .map(([date, d]) => ({
      date,
      totalOrders: d.totalOrders,
      totalRevenue: d.totalRevenue,
      avgOrderValue: ratio(d.totalRevenue, d.totalOrders),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupRevenue(
  orders: readonly AnalyticsOrder[],
  keyOf: (order: AnalyticsOrder) => string
): { key: string; revenue: number; count: number }[] {
  const groups = new Map<string, { revenue: number; count: number }>();
  for (const order of orders) {
    const key = keyOf(order);
    const g = groups.get(key) ?? { revenue: 0, count: 0 };
    groups.set(key, { revenue: g.revenue + order.total, count: g.count + 1 });
  }
  return sortedByRevenue(Array.from(groups.entries()).map(([key, g]) => ({ key, ...g })));
}

/**
 * Revenue by payment method: each order's share under each method it was paid
 * with, counted once per method it used. Highest revenue first.
 */
function groupByMethod(orders: readonly AnalyticsOrder[]): { key: string; revenue: number; count: number }[] {
  const groups = new Map<string, { revenue: number; count: number }>();
  for (const order of orders) {
    for (const slice of orderMethodSlices(order)) {
      const g = groups.get(slice.method) ?? { revenue: 0, count: 0 };
      groups.set(slice.method, { revenue: g.revenue + slice.amount, count: g.count + 1 });
    }
  }
  return sortedByRevenue(Array.from(groups.entries()).map(([key, g]) => ({ key, ...g })));
}

export function computeRevenueBreakdown(orders: readonly AnalyticsOrder[]) {
  const live = orders.filter((o) => !isCancelled(o));
  return {
    byOrderType: groupRevenue(live, (o) => o.orderType ?? UNKNOWN).map(({ key, ...g }) => ({
      type: key,
      ...g,
    })),
    byPaymentMethod: groupByMethod(live).map(({ key, ...g }) => ({
      method: key,
      ...g,
    })),
  };
}

/**
 * Orders grouped by the place they were taken. Counts include cancelled orders
 * so they sum to `totalOrders`; revenue excludes them so it matches
 * `totalRevenue`. Busiest first, ties in first-seen order.
 */
function summarizeOrderChannels(
  orders: readonly AnalyticsOrder[]
): { source: string; count: number; revenue: number }[] {
  const channels = new Map<string, { count: number; revenue: number }>();
  for (const order of orders) {
    const source = order.source ?? "";
    const existing = channels.get(source) ?? { count: 0, revenue: 0 };
    channels.set(source, {
      count: existing.count + 1,
      revenue: existing.revenue + (isCancelled(order) ? 0 : order.total),
    });
  }
  return Array.from(channels.entries())
    .map(([source, data]) => ({ source, ...data }))
    .sort((a, b) => b.count - a.count);
}

export function computeSalesAnalytics(
  current: readonly AnalyticsOrder[],
  previous: readonly AnalyticsOrder[]
) {
  const completed = current.filter((o) => !isCancelled(o));
  const cancelled = current.filter(isCancelled);
  const prevCompleted = previous.filter((o) => !isCancelled(o));

  const totalRevenue = completed.reduce((sum, o) => sum + o.total, 0);
  const prevRevenue = prevCompleted.reduce((sum, o) => sum + o.total, 0);
  const cancelledRevenue = cancelled.reduce((sum, o) => sum + o.total, 0);

  const ordersByStatus: Record<string, number> = {};
  for (const order of current) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
  }

  return {
    totalRevenue,
    totalOrders: current.length,
    completedOrders: completed.length,
    avgOrderValue: ratio(totalRevenue, completed.length),
    cancelledOrders: cancelled.length,
    cancelledRevenue,
    cancellationRate: ratio(cancelled.length, current.length),
    ordersBySource: {
      web: current.filter((o) => o.source === "web").length,
      mobile: current.filter((o) => o.source === "mobile").length,
    },
    // The full split — counter, QR handoff and anything else `source` holds.
    // `ordersBySource` stays because the web admin still reads those two.
    ordersByChannel: summarizeOrderChannels(current),
    ordersByStatus,
    revenueGrowth: prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : 0,
  };
}

export function computePaymentMethodAnalytics(orders: readonly AnalyticsOrder[]) {
  const live = orders.filter((o) => !isCancelled(o));

  const methods = groupByMethod(live).map(({ key, revenue, count }) => ({
    method: key,
    count,
    revenue,
    percentage: ratio(count, live.length),
    avgOrderValue: ratio(revenue, count),
  }));

  const daily = new Map<string, Record<string, number>>();
  for (const order of live) {
    const date = localDateKey(order.createdAtMs);
    const day = orderMethodSlices(order).reduce<Record<string, number>>(
      (acc, slice: MethodSlice) => ({ ...acc, [slice.method]: (acc[slice.method] ?? 0) + slice.amount }),
      daily.get(date) ?? {}
    );
    daily.set(date, day);
  }

  const dailyBreakdown = Array.from(daily.entries())
    .map(([date, byMethod]) => ({ date, methods: byMethod }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { methods, dailyBreakdown };
}

export function computeOrderHeatmap(orders: readonly AnalyticsOrder[]) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (isCancelled(order)) continue;
    const key = `${localDayOfWeek(order.createdAtMs)}-${localHour(order.createdAtMs)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const heatmap: { day: number; hour: number; count: number }[] = [];
  let peakHour = { day: 0, hour: 0, count: 0 };
  let quietHour = { day: 0, hour: 0, count: Number.POSITIVE_INFINITY };

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = counts.get(`${day}-${hour}`) ?? 0;
      heatmap.push({ day, hour, count });
      if (count > peakHour.count) peakHour = { day, hour, count };
      if (count < quietHour.count) quietHour = { day, hour, count };
    }
  }

  if (!Number.isFinite(quietHour.count)) quietHour = { day: 0, hour: 0, count: 0 };

  return { heatmap, peakHour, quietHour };
}

interface CustomerTally {
  name: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: number;
}

/**
 * Groups by the canonical identity of each order's guest (normalized phone,
 * then email). Anonymous walk-in/POS orders identify nobody and are tallied
 * apart rather than collapsed into one fake regular.
 */
export function computeCustomerInsights(orders: readonly AnalyticsOrder[]) {
  const customers = new Map<string, CustomerTally>();
  let walkInOrders = 0;
  let walkInRevenue = 0;
  let identifiedOrders = 0;
  let identifiedRevenue = 0;

  for (const order of orders) {
    if (isCancelled(order)) continue;
    const key = resolveOrderIdentityKey({
      name: order.customerName,
      contact: order.customerContact,
      customerData: order.customerData,
    });
    if (!key) {
      walkInOrders += 1;
      walkInRevenue += order.total;
      continue;
    }
    identifiedOrders += 1;
    identifiedRevenue += order.total;
    const existing = customers.get(key);
    customers.set(
      key,
      existing
        ? {
            name: existing.name,
            orderCount: existing.orderCount + 1,
            totalSpent: existing.totalSpent + order.total,
            lastOrderDate: Math.max(existing.lastOrderDate, order.createdAtMs),
          }
        : { name: order.customerName, orderCount: 1, totalSpent: order.total, lastOrderDate: order.createdAtMs }
    );
  }

  const tallies = Array.from(customers.values());
  const totalCustomers = tallies.length;
  const returningCustomers = tallies.filter((c) => c.orderCount > 1).length;

  const topCustomers = [...tallies]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, TOP_CUSTOMERS)
    .map((c) => ({
      name: c.name,
      // Deliberately blank: the contact never leaves the aggregate.
      contact: "",
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      lastOrderDate: c.lastOrderDate,
    }));

  return {
    totalCustomers,
    newCustomers: totalCustomers - returningCustomers,
    returningCustomers,
    returnRate: ratio(returningCustomers, totalCustomers),
    avgOrdersPerCustomer: ratio(identifiedOrders, totalCustomers),
    avgRevenuePerCustomer: ratio(identifiedRevenue, totalCustomers),
    topCustomers,
    walkInOrders,
    walkInRevenue,
  };
}
