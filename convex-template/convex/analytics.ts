import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

export const getUpsellAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const shown = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const clicked = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_clicked"))
      .collect();
    const converted = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const shownCount = shown.filter((e) => e._creationTime >= cutoff).length;
    const clickedCount = clicked.filter((e) => e._creationTime >= cutoff).length;
    const convertedCount = converted.filter((e) => e._creationTime >= cutoff).length;

    return {
      shown: shownCount,
      clicked: clickedCount,
      converted: convertedCount,
      clickRate: shownCount > 0 ? clickedCount / shownCount : 0,
      conversionRate: shownCount > 0 ? convertedCount / shownCount : 0,
    };
  },
});

export const getBundleAnalytics = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const viewed = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_viewed"))
      .collect();
    const added = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "bundle_added"))
      .collect();

    const viewedCount = viewed.filter((e) => e._creationTime >= cutoff).length;
    const addedCount = added.filter((e) => e._creationTime >= cutoff).length;

    return {
      viewed: viewedCount,
      added: addedCount,
      conversionRate: viewedCount > 0 ? addedCount / viewedCount : 0,
    };
  },
});

export const getTopItems = query({
  args: {
    daysBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const recentOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    const filteredOrderIds = new Set(
      recentOrders
        .filter((o) => o._creationTime >= cutoff && o.status !== "cancelled")
        .map((o) => o._id)
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
  },
});

export const getTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_date")
      .collect();

    const cutoffDate = new Date(cutoff).toISOString().split("T")[0];

    return stats
      .filter((s) => s.date >= cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

export const getRevenueBreakdown = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const allOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    const filtered = allOrders.filter(
      (o) => o._creationTime >= cutoff && o.status !== "cancelled"
    );

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
  },
});

export const getUpsellTrends = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.daysBack ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get upsell events for the period
    const shownEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_shown"))
      .collect();
    const convertedEvents = await ctx.db
      .query("analyticsEvents")
      .withIndex("by_type", (q) => q.eq("type", "upsell_converted"))
      .collect();

    const recentShown = shownEvents.filter((e) => e._creationTime >= cutoff);
    const recentConverted = convertedEvents.filter((e) => e._creationTime >= cutoff);

    // Group by date for daily rates
    const dailyMap = new Map<string, { shown: number; converted: number }>();
    for (const event of recentShown) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
      const existing = dailyMap.get(date) ?? { shown: 0, converted: 0 };
      existing.shown += 1;
      dailyMap.set(date, existing);
    }
    for (const event of recentConverted) {
      const date = new Date(event._creationTime).toISOString().split("T")[0];
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
    const recentOrders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();
    const filteredOrderIds = new Set(
      recentOrders
        .filter((o) => o._creationTime >= cutoff && o.status !== "cancelled")
        .map((o) => o._id)
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
