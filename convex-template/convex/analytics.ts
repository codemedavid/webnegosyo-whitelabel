import type { FilterBuilder } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { orderTime, orderTimeFilter } from './orderTime';
import { v, type ObjectType } from "convex/values";
import { orderBranchFilter, eventBranchFilter } from "./branchFilter";
import { summarizeOrderChannels } from "./analyticsChannels";
import { mutation, query, internalQuery, type QueryCtx } from "./_generated/server";
import { requireAccess } from "./auth";
import { localDayStartMs, localDateKey, localDayOfWeek, localHour } from "./time";
import { resolveAnalyticsContact } from "./customerIdentity";

// Safety cap for queries that load large collections
const QUERY_LIMIT = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instants a report is about.
 *
 * `daysBack` can only say "the last N days ending now", so a merchant could
 * never ask how one particular day went, or compare the first half of a month
 * with the second. `startMs`/`endMs` say it exactly.
 *
 * Both are OPTIONAL and both arms stay live on purpose. Every store runs its
 * own deployment and they are re-pushed in bulk, so a screen on an older
 * bundle keeps sending `daysBack` alone and must keep getting exactly what it
 * got before. `end` is Infinity for that rolling case, which leaves the
 * existing single-ended filters behaving as they always did.
 */
function resolveWindow(
  args: { daysBack?: number; startMs?: number; endMs?: number },
  defaultDays: number
): { start: number; end: number } {
  if (args.startMs !== undefined) {
    return { start: args.startMs, end: args.endMs ?? Date.now() };
  }
  return { start: Date.now() - (args.daysBack ?? defaultDays) * DAY_MS, end: Infinity };
}

/** Half-open `[start, end)`, so a boundary instant belongs to one day only. */
function inWindow(atMs: number, window: { start: number; end: number }): boolean {
  return atMs >= window.start && atMs < window.end;
}

/** The window of equal length immediately before this one. */
function precedingWindow(window: { start: number; end: number }): { start: number; end: number } {
  const end = Number.isFinite(window.end) ? window.end : Date.now();
  return { start: window.start - (end - window.start), end: window.start };
}

/** The order-time predicate for a window, upper bound included when bounded. */
function orderWindowFilter(
  q: FilterBuilder<DataModel["orders"]>,
  window: { start: number; end: number }
) {
  const lower = orderTimeFilter(q, "gte", window.start);
  if (!Number.isFinite(window.end)) return lower;
  return q.and(lower, orderTimeFilter(q, "lt", window.end));
}

/** The window arguments every analytics query accepts. */
const windowArgs = {
  daysBack: v.optional(v.number()),
  /**
   * v32. A bounded report window. Optional so every caller that asks exactly
   * what it asks today keeps working — a validator rejects arguments it does
   * not know, so a new REQUIRED argument would break every screen at once.
   */
  startMs: v.optional(v.number()),
  endMs: v.optional(v.number()),
};

export const trackEvent = mutation({
  args: {
    type: v.string(),
    metadata: v.optional(v.any()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("analyticsEvents", args);
  },
});

const getUpsellAnalyticsArgs = {
    ...windowArgs,
    outletId: v.optional(v.string()),
};

async function getUpsellAnalyticsHandler(ctx: QueryCtx, args: ObjectType<typeof getUpsellAnalyticsArgs>) {
    const window = resolveWindow(args, 7);

    const shown = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();
    const clicked = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_clicked"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();
    const converted = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();

    const shownCount = shown.filter((e) => inWindow(e._creationTime, window)).length;
    const clickedCount = clicked.filter((e) => inWindow(e._creationTime, window)).length;
    const convertedCount = converted.filter((e) => inWindow(e._creationTime, window)).length;

    return {
      shown: shownCount,
      clicked: clickedCount,
      converted: convertedCount,
      clickRate: shownCount > 0 ? clickedCount / shownCount : 0,
      conversionRate: shownCount > 0 ? convertedCount / shownCount : 0,
    };
}

export const getUpsellAnalytics = query({
  args: getUpsellAnalyticsArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getUpsellAnalyticsHandler(ctx, args);
  },
});

export const getUpsellAnalyticsInternal = internalQuery({ args: getUpsellAnalyticsArgs, handler: getUpsellAnalyticsHandler });

export const getBundleAnalytics = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 7);

    const viewed = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_viewed"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();
    const added = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_added"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();

    const viewedCount = viewed.filter((e) => inWindow(e._creationTime, window)).length;
    const addedCount = added.filter((e) => inWindow(e._creationTime, window)).length;

    return {
      viewed: viewedCount,
      added: addedCount,
      conversionRate: viewedCount > 0 ? addedCount / viewedCount : 0,
    };
  },
});

const getTopItemsArgs = {
    ...windowArgs,
    outletId: v.optional(v.string()),
    limit: v.optional(v.number()),
};

async function getTopItemsHandler(ctx: QueryCtx, args: ObjectType<typeof getTopItemsArgs>) {
    const window = resolveWindow(args, 7);

    // Server-side filter: only fetch orders from the period instead of all
    const recentOrders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const filteredOrderIds = new Set(
      recentOrders.map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const recentItems = allItems.filter((i) => filteredOrderIds.has(i.orderId));

    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();

    for (const item of recentItems) {
      const existing = itemMap.get(item.menuItemId) ?? {
        name: item.menuItemName,
        count: 0,
        revenue: 0,
      };
      existing.count += item.quantity;
      existing.revenue += item.subtotal;
      itemMap.set(item.menuItemId, existing);
    }

    return Array.from(itemMap.entries())
      .map(([itemId, data]) => ({ itemId, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, args.limit ?? 10);
}

export const getTopItems = query({
  args: getTopItemsArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getTopItemsHandler(ctx, args);
  },
});

export const getTopItemsInternal = internalQuery({ args: getTopItemsArgs, handler: getTopItemsHandler });

const getTrendsArgs = {
    ...windowArgs,
    outletId: v.optional(v.string()),
};

async function getTrendsHandler(ctx: QueryCtx, args: ObjectType<typeof getTrendsArgs>) {
    // Compute trends LIVE from orders (not the dailyStats snapshot) so the
    // series is reactive: cancelling an order — even on a past day — drops that
    // day's revenue immediately, and today's bar appears as soon as orders come
    // in (the old 23:59-UTC cron only wrote today's row, never corrected the
    // past, and excluded the in-progress day). Bucketed by the merchant's
    // local (PH) day.
    //
    // A rolling request still gets the inclusive N-day window ending on the
    // current local day, so the series starts on a day boundary rather than
    // mid-afternoon N days ago and the first bar is never a part-day.
    const days = args.daysBack ?? 30;
    const window =
      args.startMs !== undefined
        ? resolveWindow(args, days)
        : { start: localDayStartMs(Date.now()) - (days - 1) * DAY_MS, end: Infinity };

    const orders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    const dayMap = new Map<string, { totalOrders: number; totalRevenue: number }>();
    for (const order of orders) {
      const date = localDateKey(orderTime(order));
      const existing = dayMap.get(date) ?? { totalOrders: 0, totalRevenue: 0 };
      existing.totalOrders += 1;
      existing.totalRevenue += order.total;
      dayMap.set(date, existing);
    }

    return Array.from(dayMap.entries())
      .map(([date, d]) => ({
        date,
        totalOrders: d.totalOrders,
        totalRevenue: d.totalRevenue,
        avgOrderValue: d.totalOrders > 0 ? d.totalRevenue / d.totalOrders : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
}

export const getTrends = query({
  args: getTrendsArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getTrendsHandler(ctx, args);
  },
});

export const getTrendsInternal = internalQuery({ args: getTrendsArgs, handler: getTrendsHandler });

const getRevenueBreakdownArgs = {
    ...windowArgs,
    outletId: v.optional(v.string()),
};

async function getRevenueBreakdownHandler(ctx: QueryCtx, args: ObjectType<typeof getRevenueBreakdownArgs>) {
    const window = resolveWindow(args, 7);

    // Server-side filter: push date and status filtering into the query
    const filtered = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Group by order type
    const orderTypeMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const type = order.orderType ?? "Unknown";
      const existing = orderTypeMap.get(type) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      orderTypeMap.set(type, existing);
    }

    // Group by payment method
    const paymentMethodMap = new Map<string, { revenue: number; count: number }>();
    for (const order of filtered) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = paymentMethodMap.get(method) ?? { revenue: 0, count: 0 };
      existing.revenue += order.total;
      existing.count += 1;
      paymentMethodMap.set(method, existing);
    }

    return {
      byOrderType: Array.from(orderTypeMap.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentMethod: Array.from(paymentMethodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
    };
}

export const getRevenueBreakdown = query({
  args: getRevenueBreakdownArgs,
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    return getRevenueBreakdownHandler(ctx, args);
  },
});

export const getRevenueBreakdownInternal = internalQuery({ args: getRevenueBreakdownArgs, handler: getRevenueBreakdownHandler });

export const getUpsellTrends = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 7);

    // Get upsell events for the period
    const shownEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();
    const convertedEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .filter((q) => eventBranchFilter(q, args.outletId))
      .collect();

    const recentShown = shownEvents.filter((e) => inWindow(e._creationTime, window));
    const recentConverted = convertedEvents.filter((e) => inWindow(e._creationTime, window));

    // Group by date for daily rates
    const dailyMap = new Map<string, { shown: number; converted: number }>();
    for (const event of recentShown) {
      const date = localDateKey(event._creationTime);
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.shown += 1;
      dailyMap.set(date, existing);
    }
    for (const event of recentConverted) {
      const date = localDateKey(event._creationTime);
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.converted += 1;
      dailyMap.set(date, existing);
    }

    const dailyRates = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        rate: data.shown > 0 ? data.converted / data.shown : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate total upsell revenue from order items
    // Server-side filter: only fetch orders from the period
    const recentOrders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);
    const filteredOrderIds = new Set(
      recentOrders.map((o) => o._id)
    );

    const allItems = await ctx.db.query("orderItems").collect();
    const upsellRevenue = allItems
      .filter((i) => filteredOrderIds.has(i.orderId) && i.isUpsellItem)
      .reduce((sum, i) => sum + i.subtotal, 0);

    return {
      dailyRates,
      totalUpsellRevenue: upsellRevenue,
    };
  },
});

export const getSalesAnalytics = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 7);
    // "vs previous" means the window of the same LENGTH immediately before
    // this one, so a picked day compares against the day before it rather than
    // against a week.
    const previous = precedingWindow(window);

    // Current period orders
    const currentOrders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) => orderWindowFilter(q, window))
      .order("desc")
      .take(QUERY_LIMIT);

    // Previous period orders (for growth comparison)
    const prevOrders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) => orderWindowFilter(q, previous))
      .order("desc")
      .take(QUERY_LIMIT);

    const completed = currentOrders.filter((o) => o.status !== "cancelled");
    const cancelled = currentOrders.filter((o) => o.status === "cancelled");
    const prevCompleted = prevOrders.filter((o) => o.status !== "cancelled");

    const totalRevenue = completed.reduce((sum, o) => sum + o.total, 0);
    const prevRevenue = prevCompleted.reduce((sum, o) => sum + o.total, 0);
    const cancelledRevenue = cancelled.reduce((sum, o) => sum + o.total, 0);

    const webOrders = currentOrders.filter((o) => o.source === "web").length;
    const mobileOrders = currentOrders.filter((o) => o.source === "mobile").length;

    const statusCounts: Record<string, number> = {};
    for (const order of currentOrders) {
      statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    }

    return {
      totalRevenue,
      totalOrders: currentOrders.length,
      completedOrders: completed.length,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      cancelledOrders: cancelled.length,
      cancelledRevenue,
      cancellationRate: currentOrders.length > 0 ? cancelled.length / currentOrders.length : 0,
      ordersBySource: { web: webOrders, mobile: mobileOrders },
      // The full split. `ordersBySource` stays for the web admin, which still
      // reads those two fields directly.
      ordersByChannel: summarizeOrderChannels(currentOrders),
      ordersByStatus: statusCounts,
      revenueGrowth: prevRevenue > 0 ? (totalRevenue - prevRevenue) / prevRevenue : 0,
    };
  },
});

export const getPaymentMethodAnalytics = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 7);

    const orders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Aggregate by payment method
    const methodMap = new Map<string, { count: number; revenue: number; totalOrderValue: number }>();
    for (const order of orders) {
      const method = order.paymentMethod ?? "Unknown";
      const existing = methodMap.get(method) ?? { count: 0, revenue: 0, totalOrderValue: 0 };
      existing.count += 1;
      existing.revenue += order.total;
      existing.totalOrderValue += order.total;
      methodMap.set(method, existing);
    }

    const totalOrders = orders.length;
    const methods = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        revenue: data.revenue,
        percentage: totalOrders > 0 ? data.count / totalOrders : 0,
        avgOrderValue: data.count > 0 ? data.totalOrderValue / data.count : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Daily breakdown for trend lines
    const dailyMap = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const date = localDateKey(orderTime(order));
      const method = order.paymentMethod ?? "Unknown";
      if (!dailyMap.has(date)) dailyMap.set(date, new Map());
      const dayMethods = dailyMap.get(date)!;
      dayMethods.set(method, (dayMethods.get(method) ?? 0) + order.total);
    }

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, methodRevenues]) => ({
        date,
        methods: Object.fromEntries(methodRevenues),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { methods, dailyBreakdown };
  },
});

export const getOrderHeatmap = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 30);

    const orders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Build 7x24 heatmap (day 0=Sun, 1=Mon, ..., 6=Sat)
    const grid: { day: number; hour: number; count: number }[] = [];
    const countMap = new Map<string, number>();

    for (const order of orders) {
      const key = `${localDayOfWeek(orderTime(order))}-${localHour(orderTime(order))}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    let peakHour = { day: 0, hour: 0, count: 0 };
    let quietHour = { day: 0, hour: 0, count: Infinity };

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = countMap.get(`${day}-${hour}`) ?? 0;
        grid.push({ day, hour, count });
        if (count > peakHour.count) peakHour = { day, hour, count };
        if (count < quietHour.count) quietHour = { day, hour, count };
      }
    }

    // Fix quietHour if no orders at all
    if (quietHour.count === Infinity) quietHour = { day: 0, hour: 0, count: 0 };

    return { heatmap: grid, peakHour, quietHour };
  },
});

export const getCustomerInsights = query({
  args: {
    ...windowArgs,
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const window = resolveWindow(args, 30);

    const orders = await ctx.db
      .query("orders")
      .filter((q) => orderBranchFilter(q, args.outletId))
      .filter((q) =>
        q.and(
          orderWindowFilter(q, window),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("desc")
      .take(QUERY_LIMIT);

    // Group by a canonical identity resolved from each order's contact and
    // customerData (normalized phone, then email). Anonymous walk-in/POS orders
    // resolve to "" and are NOT customers — they'd collapse into one fake entry
    // — so they are tallied separately instead.
    const customerMap = new Map<string, {
      name: string;
      orderCount: number;
      totalSpent: number;
      lastOrderDate: number;
    }>();
    let walkInOrders = 0;
    let walkInRevenue = 0;
    let identifiedOrders = 0;
    let identifiedRevenue = 0;

    for (const order of orders) {
      // Resolve one canonical key per real person from the stored contact OR
      // customerData (recovers legacy/cross-channel orders). Blank => walk-in.
      const key = resolveAnalyticsContact(order.customerContact, order.customerData);
      if (!key) {
        walkInOrders += 1;
        walkInRevenue += order.total;
        continue;
      }
      identifiedOrders += 1;
      identifiedRevenue += order.total;
      const existing = customerMap.get(key);
      if (existing) {
        existing.orderCount += 1;
        existing.totalSpent += order.total;
        existing.lastOrderDate = Math.max(existing.lastOrderDate, orderTime(order));
      } else {
        customerMap.set(key, {
          name: order.customerName,
          orderCount: 1,
          totalSpent: order.total,
          lastOrderDate: orderTime(order),
        });
      }
    }

    const customers = Array.from(customerMap.values());
    const totalCustomers = customers.length;
    const returningCustomers = customers.filter((c) => c.orderCount > 1).length;
    const newCustomers = totalCustomers - returningCustomers;

    const topCustomers = customers
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((c) => ({
        name: c.name,
        contact: "",  // omit contact for privacy in display
        orderCount: c.orderCount,
        totalSpent: c.totalSpent,
        lastOrderDate: c.lastOrderDate,
      }));

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      returnRate: totalCustomers > 0 ? returningCustomers / totalCustomers : 0,
      // Averages cover identified customers only, so anonymous walk-ins can't
      // skew spend-per-customer.
      avgOrdersPerCustomer: totalCustomers > 0 ? identifiedOrders / totalCustomers : 0,
      avgRevenuePerCustomer: totalCustomers > 0 ? identifiedRevenue / totalCustomers : 0,
      topCustomers,
      walkInOrders,
      walkInRevenue,
    };
  },
});
