import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { previousBusinessDayWindow } from "./time";

/**
 * The `dailyStats` snapshot of the business day that just ENDED.
 *
 * Runs once a day after the latest cutoff a store may set (11:45 AM Manila;
 * see crons.ts), so the day it snapshots is complete whatever the store's
 * cutoff. The old version ran at 23:59 UTC = 7:59 AM Manila and wrote
 * "today", which only ever held midnight to 8 AM. Each figure reads the same
 * bounded window, so the row describes exactly one business day.
 */
export const aggregateBusinessDay = internalAction({
  handler: async (ctx) => {
    const schedule = await ctx.runQuery(internal.businessDayConfig.getCutoffScheduleInternal, {});
    const day = previousBusinessDayWindow(Date.now(), schedule);

    // getDashboardStatsByPeriod is inclusive at both ends.
    const stats = await ctx.runQuery(internal.orders.getDashboardStatsByPeriodInternal, {
      startDate: day.startMs,
      endDate: day.endMs - 1,
    });
    const upsellStats = await ctx.runQuery(internal.analytics.getUpsellAnalyticsInternal, {
      startMs: day.startMs,
      endMs: day.endMs,
    });
    const topItems = await ctx.runQuery(internal.analytics.getTopItemsInternal, {
      startMs: day.startMs,
      endMs: day.endMs,
      limit: 10,
    });

    await ctx.runMutation(internal.statsAggregator.upsertDailyStat, {
      date: day.dayKey,
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
