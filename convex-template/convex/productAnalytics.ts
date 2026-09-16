import { orderTime, orderTimeFilter } from './orderTime';
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";

import { requireAccess } from './auth';
import { orderBranchFilter } from './branchFilter';
import { computeProductAnalytics, resolveProductPeriod } from './productAnalyticsCompute';

async function branchProducts(ctx: QueryCtx, args: { period?: string; outletId?: string }) {
  const period = resolveProductPeriod(args.period);
  const nowMs = Date.now();
  const cutoff = period === 'all' ? 0 : nowMs - (period === '7d' ? 14 : 30) * 86400000;
  const orders = await ctx.db.query('orders')
    .filter(q => q.and(orderBranchFilter(q, args.outletId), orderTimeFilter(q, "gte", cutoff), q.neq(q.field('status'), 'cancelled')))
    .order('desc').take(10000);
  const items = (await Promise.all(orders.map(order => ctx.db.query('orderItems')
    .withIndex('by_order', q => q.eq('orderId', order._id)).collect()))).flat();
  const costs = await ctx.db.query('productCosts').collect();
  return computeProductAnalytics({
    orders: orders.map(o => ({ id: o._id, createdAtMs: orderTime(o), status: o.status })),
    items, costs, period, nowMs,
  });
}

export const getAll = query({
  args: {
    period: v.optional(v.string()),
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const period = args.period ?? "30d";
    const all = args.outletId
      ? await branchProducts(ctx, args)
      : await ctx.db.query("productAnalytics").collect();
    return all.filter((a) => a.period === period);
  },
});

export const getByItem = query({
  args: {
    menuItemId: v.string(),
    period: v.optional(v.string()),
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const period = args.period ?? "30d";
    if (args.outletId) {
      return (await branchProducts(ctx, args)).find(row => row.menuItemId === args.menuItemId) ?? null;
    }
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
    outletId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, "read");
    const period = args.period ?? "30d";
    const all = args.outletId
      ? await branchProducts(ctx, args)
      : await ctx.db.query("productAnalytics").collect();
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
