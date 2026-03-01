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
