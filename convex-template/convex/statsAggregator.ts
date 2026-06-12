import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { localDateKey } from "./time";

export const aggregateToday = internalAction({
  handler: async (ctx) => {
    const stats = await ctx.runQuery(api.orders.getDashboardStats, {});
    const upsellStats = await ctx.runQuery(api.analytics.getUpsellAnalytics, {
      daysBack: 1,
    });
    const topItems = await ctx.runQuery(api.analytics.getTopItems, {
      daysBack: 1,
      limit: 10,
    });

    const today = localDateKey(Date.now());

    await ctx.runMutation(internal.statsAggregator.upsertDailyStat, {
      date: today,
      totalOrders: stats.totalOrders,
      totalRevenue: stats.totalRevenue,
      avgOrderValue: stats.avgOrderValue,
      upsellConversionRate: upsellStats.conversionRate,
      topItems,
    });
  },
});

export const upsertDailyStat = internalMutation({
  args: {
    date: v.string(),
    totalOrders: v.number(),
    totalRevenue: v.number(),
    avgOrderValue: v.number(),
    upsellConversionRate: v.optional(v.number()),
    topItems: v.optional(
      v.array(
        v.object({
          itemId: v.string(),
          name: v.string(),
          count: v.number(),
          revenue: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dailyStats")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("dailyStats", args);
    }
  },
});
