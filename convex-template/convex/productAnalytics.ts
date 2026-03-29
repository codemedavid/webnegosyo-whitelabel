import { v } from "convex/values";
import { query } from "./_generated/server";

export const getAll = query({
  args: {
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const period = args.period ?? "30d";
    const all = await ctx.db.query("productAnalytics").collect();
    return all.filter((a) => a.period === period);
  },
});

export const getByItem = query({
  args: {
    menuItemId: v.string(),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const period = args.period ?? "30d";
    return await ctx.db
      .query("productAnalytics")
      .withIndex("by_item_period", (q) =>
        q.eq("menuItemId", args.menuItemId).eq("period", period)
      )
      .first();
  },
});

export const getPortfolioSummary = query({
  args: {
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const period = args.period ?? "30d";
    const all = await ctx.db.query("productAnalytics").collect();
    const filtered = all.filter((a) => a.period === period);

    const counts = { star: 0, plowhorse: 0, puzzle: 0, dog: 0, unclassified: 0 };
    let totalRevenue = 0;
    let starRevenue = 0;

    for (const item of filtered) {
      const cls = item.bcgClassification as keyof typeof counts;
      if (cls in counts) {
        counts[cls]++;
      }
      totalRevenue += item.totalRevenue;
      if (cls === "star") {
        starRevenue += item.totalRevenue;
      }
    }

    const starRevenuePercent =
      totalRevenue > 0 ? Math.round((starRevenue / totalRevenue) * 1000) / 10 : 0;

    const lowMarginPlowhorses = filtered.filter(
      (a) =>
        a.bcgClassification === "plowhorse" &&
        a.marginPercent !== undefined &&
        a.marginPercent < 15
    );

    return {
      counts,
      totalProducts: filtered.length,
      starRevenuePercent,
      lowMarginPlowhorses: lowMarginPlowhorses.map((p) => ({
        menuItemId: p.menuItemId,
        marginPercent: p.marginPercent,
      })),
    };
  },
});
