import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";

const QUERY_LIMIT = 10000;
const MIN_ORDERS_FOR_CLASSIFICATION = 5;
const MIN_PRODUCTS_FOR_MEDIAN = 2;
const PRICE_SUGGESTION_CAP = 0.2; // +/- 20%

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface ProductStats {
  menuItemId: string;
  menuItemName: string;
  totalUnitsSold: number;
  totalRevenue: number;
  avgDailyUnits: number;
  lastOrderDate: number | undefined;
}

interface CostData {
  menuItemId: string;
  costPrice: number;
}

interface ClassifiedProduct {
  menuItemId: string;
  menuItemName: string;
  totalUnitsSold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number | undefined;
  avgDailyUnits: number;
  bcgClassification: string;
  lastOrderDate: number | undefined;
}

function classifyProducts(
  stats: ProductStats[],
  costs: CostData[]
): ClassifiedProduct[] {
  const costMap = new Map(costs.map((c) => [c.menuItemId, c.costPrice]));

  // Calculate margin for each product
  const products: ClassifiedProduct[] = stats.map((s) => {
    const costPrice = costMap.get(s.menuItemId);
    const hasCost = costPrice !== undefined;
    const totalCost = hasCost ? s.totalUnitsSold * costPrice : 0;
    const totalProfit = hasCost ? s.totalRevenue - totalCost : 0;
    const marginPercent =
      hasCost && s.totalRevenue > 0
        ? Math.round((totalProfit / s.totalRevenue) * 1000) / 10
        : undefined;

    return {
      ...s,
      totalCost,
      totalProfit,
      marginPercent,
      bcgClassification: "unclassified",
    };
  });

  // Filter eligible products for median calculation
  const eligible = products.filter(
    (p) =>
      p.marginPercent !== undefined &&
      p.totalUnitsSold >= MIN_ORDERS_FOR_CLASSIFICATION
  );

  if (eligible.length < MIN_PRODUCTS_FOR_MEDIAN) {
    return products; // All stay unclassified
  }

  const medianSales = median(eligible.map((p) => p.avgDailyUnits));
  const medianMargin = median(
    eligible.map((p) => p.marginPercent as number)
  );

  for (const product of products) {
    if (
      product.marginPercent === undefined ||
      product.totalUnitsSold < MIN_ORDERS_FOR_CLASSIFICATION
    ) {
      product.bcgClassification = "unclassified";
    } else if (
      product.avgDailyUnits >= medianSales &&
      product.marginPercent >= medianMargin
    ) {
      product.bcgClassification = "star";
    } else if (
      product.avgDailyUnits >= medianSales &&
      product.marginPercent < medianMargin
    ) {
      product.bcgClassification = "plowhorse";
    } else if (
      product.avgDailyUnits < medianSales &&
      product.marginPercent >= medianMargin
    ) {
      product.bcgClassification = "puzzle";
    } else {
      product.bcgClassification = "dog";
    }
  }

  return products;
}

function generateRecommendation(
  product: ClassifiedProduct,
  medianMargin: number,
  costPrice: number | undefined
): string {
  switch (product.bcgClassification) {
    case "star":
      if (costPrice && costPrice > 0 && product.totalRevenue > 0) {
        const currentPrice = product.totalRevenue / product.totalUnitsSold;
        const suggestedIncrease = Math.min(
          currentPrice * PRICE_SUGGESTION_CAP,
          currentPrice * ((medianMargin + 10) / 100) - (currentPrice - costPrice)
        );
        if (suggestedIncrease > 1) {
          return `Protect this item. Consider a slight price increase of +₱${Math.round(suggestedIncrease)} to maximize profit.`;
        }
      }
      return "Protect this item. It's your best performer — high sales and high margins.";

    case "plowhorse":
      if (costPrice && costPrice > 0 && product.totalRevenue > 0) {
        const currentPrice = product.totalRevenue / product.totalUnitsSold;
        const targetPrice = costPrice / (1 - medianMargin / 100);
        const diff = Math.round(targetPrice - currentPrice);
        const cappedDiff = Math.min(diff, Math.round(currentPrice * PRICE_SUGGESTION_CAP));
        if (cappedDiff > 0) {
          return `Popular but thin margins. Raise price by ₱${cappedDiff} to improve profitability. Don't remove — it drives traffic.`;
        }
      }
      return "Popular but thin margins. Reduce portion cost or raise price slightly. Don't remove — it drives traffic.";

    case "puzzle":
      return "High profit per sale but low orders. Feature it prominently, add it to upsell pairs, or bundle with a Star item.";

    case "dog":
      return "Not selling and not profitable. Consider reworking the recipe/price, or replacing with a new item.";

    default:
      return "Add cost price and accumulate orders to unlock insights.";
  }
}

function generatePairingRecommendation(
  product: ClassifiedProduct,
  allProducts: ClassifiedProduct[]
): { recommendation: string; itemId: string; reason: string } | null {
  if (product.bcgClassification === "unclassified") return null;

  const others = allProducts.filter(
    (p) =>
      p.menuItemId !== product.menuItemId &&
      p.bcgClassification !== "unclassified"
  );

  if (others.length === 0) return null;

  let target: ClassifiedProduct | undefined;
  let reason = "";

  switch (product.bcgClassification) {
    case "star": {
      // Promote alongside highest-margin Puzzle to boost its visibility
      const puzzles = others.filter((p) => p.bcgClassification === "puzzle");
      target = puzzles.sort(
        (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
      )[0];
      if (!target) {
        target = others.sort(
          (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
        )[0];
      }
      reason = target
        ? `Promote alongside ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) — suggest it as an add-on when customers order this best-seller.`
        : "";
      break;
    }

    case "plowhorse": {
      // Cross-promote with highest-margin Star or Puzzle to lift margins
      const highMargin = others.filter(
        (p) => p.bcgClassification === "star" || p.bcgClassification === "puzzle"
      );
      target = highMargin.sort(
        (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
      )[0];
      if (!target) {
        target = others.sort(
          (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
        )[0];
      }
      reason = target
        ? `Cross-promote with ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) — suggest it as an add-on to lift combined margins on this high-traffic item.`
        : "";
      break;
    }

    case "puzzle": {
      // Feature alongside highest-traffic item to gain visibility
      const highSales = others.filter(
        (p) =>
          p.bcgClassification === "star" || p.bcgClassification === "plowhorse"
      );
      target = highSales.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      if (!target) {
        target = others.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      }
      reason = target
        ? `Feature alongside ${target.menuItemName} (${target.bcgClassification}, ${target.avgDailyUnits.toFixed(1)} units/day) — leverage its traffic to get this profitable item more visibility.`
        : "";
      break;
    }

    case "dog": {
      // Promote alongside popular item to move inventory
      const stars = others.filter((p) => p.bcgClassification === "star");
      target = stars.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      if (!target) {
        const plowhorses = others.filter(
          (p) => p.bcgClassification === "plowhorse"
        );
        target = plowhorses.sort(
          (a, b) => b.avgDailyUnits - a.avgDailyUnits
        )[0];
      }
      if (!target) {
        target = others.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      }
      reason = target
        ? `If keeping, promote alongside ${target.menuItemName} (${target.bcgClassification}) — leverage its popularity to move this underperformer.`
        : "";
      break;
    }
  }

  if (!target || !reason) return null;

  return {
    recommendation: `Cross-promote with ${target.menuItemName}.`,
    itemId: target.menuItemId,
    reason,
  };
}

export const computeAnalytics = internalAction({
  handler: async (ctx) => {
    // Step 1: Get all non-cancelled orders (pass high limit to override default 50)
    const allOrders = await ctx.runQuery(api.orders.getOrders, { limit: QUERY_LIMIT });
    const activeOrders = allOrders.filter((o: { status: string }) => o.status !== "cancelled");

    // Step 2: Get all order items
    const allCosts = await ctx.runQuery(api.productCosts.getAllCosts, {});

    // Step 3: Compute for each period
    const periods = ["7d", "30d", "all"] as const;
    const now = Date.now();

    for (const period of periods) {
      const cutoff =
        period === "all"
          ? 0
          : period === "30d"
            ? now - 30 * 24 * 60 * 60 * 1000
            : now - 7 * 24 * 60 * 60 * 1000;

      const daysInPeriod =
        period === "all"
          ? Math.max(
              1,
              activeOrders.length > 0
                ? Math.ceil(
                    (now - Math.min(...activeOrders.map((o: { _creationTime: number }) => o._creationTime))) /
                      (24 * 60 * 60 * 1000)
                  )
                : 1
            )
          : period === "30d"
            ? 30
            : 7;

      // Filter orders by period
      const periodOrders = activeOrders.filter(
        (o: { _creationTime: number }) => o._creationTime >= cutoff
      );
      // Get all order items and filter by period orders
      // We need to get items for each order
      const itemMap = new Map<
        string,
        { name: string; totalUnits: number; totalRevenue: number; lastOrderDate: number }
      >();

      for (const order of periodOrders) {
        const items = await ctx.runQuery(api.orders.getOrderById, { orderId: order._id });
        if (!items || !items.items) continue;

        for (const item of items.items) {
          const existing = itemMap.get(item.menuItemId) ?? {
            name: item.menuItemName,
            totalUnits: 0,
            totalRevenue: 0,
            lastOrderDate: 0,
          };
          existing.totalUnits += item.quantity;
          existing.totalRevenue += item.subtotal;
          existing.lastOrderDate = Math.max(
            existing.lastOrderDate,
            order._creationTime
          );
          itemMap.set(item.menuItemId, existing);
        }
      }

      // Build stats array
      const stats: ProductStats[] = Array.from(itemMap.entries()).map(
        ([menuItemId, data]) => ({
          menuItemId,
          menuItemName: data.name,
          totalUnitsSold: data.totalUnits,
          totalRevenue: data.totalRevenue,
          avgDailyUnits: data.totalUnits / daysInPeriod,
          lastOrderDate: data.lastOrderDate || undefined,
        })
      );

      // Classify
      const classified = classifyProducts(stats, allCosts);

      // Calculate medians for recommendations
      const eligible = classified.filter(
        (p) =>
          p.marginPercent !== undefined &&
          p.totalUnitsSold >= MIN_ORDERS_FOR_CLASSIFICATION
      );
      const medianMargin =
        eligible.length >= MIN_PRODUCTS_FOR_MEDIAN
          ? median(eligible.map((p) => p.marginPercent as number))
          : 0;

      const costMap = new Map(allCosts.map((c: CostData) => [c.menuItemId, c.costPrice]));

      // Determine trend (only for 7d period by comparing with previous 7d)
      const trendMap = new Map<string, string>();
      if (period === "7d") {
        const prevCutoff = now - 14 * 24 * 60 * 60 * 1000;
        const prevOrders = activeOrders.filter(
          (o: { _creationTime: number }) =>
            o._creationTime >= prevCutoff && o._creationTime < cutoff
        );

        const prevItemMap = new Map<string, number>();
        for (const order of prevOrders) {
          const items = await ctx.runQuery(api.orders.getOrderById, {
            orderId: order._id,
          });
          if (!items || !items.items) continue;
          for (const item of items.items) {
            prevItemMap.set(
              item.menuItemId,
              (prevItemMap.get(item.menuItemId) ?? 0) + item.quantity
            );
          }
        }

        for (const product of classified) {
          const prevUnits = (prevItemMap.get(product.menuItemId) ?? 0) / 7;
          const currentUnits = product.avgDailyUnits;
          if (prevUnits === 0 && currentUnits === 0) {
            trendMap.set(product.menuItemId, "stable");
          } else if (prevUnits === 0) {
            trendMap.set(product.menuItemId, "growing");
          } else if (currentUnits > prevUnits * 1.1) {
            trendMap.set(product.menuItemId, "growing");
          } else if (currentUnits < prevUnits * 0.9) {
            trendMap.set(product.menuItemId, "declining");
          } else {
            trendMap.set(product.menuItemId, "stable");
          }
        }
      }

      // Generate recommendations and upsert
      for (const product of classified) {
        const costPrice = costMap.get(product.menuItemId);
        const recommendation = generateRecommendation(
          product,
          medianMargin,
          costPrice
        );
        const pairing = generatePairingRecommendation(product, classified);
        const trend =
          period === "7d"
            ? trendMap.get(product.menuItemId) ?? "stable"
            : "stable";

        await ctx.runMutation(
          internal.productAnalyticsAggregator.upsertAnalytics,
          {
            menuItemId: product.menuItemId,
            menuItemName: product.menuItemName,
            period,
            totalUnitsSold: product.totalUnitsSold,
            totalRevenue: Math.round(product.totalRevenue * 100) / 100,
            totalCost: Math.round(product.totalCost * 100) / 100,
            totalProfit: Math.round(product.totalProfit * 100) / 100,
            marginPercent: product.marginPercent,
            avgDailyUnits:
              Math.round(product.avgDailyUnits * 10) / 10,
            revenueTrend: trend,
            bcgClassification: product.bcgClassification,
            recommendation,
            pairingRecommendation: pairing?.recommendation,
            pairingItemId: pairing?.itemId,
            pairingReason: pairing?.reason,
            lastOrderDate: product.lastOrderDate,
            computedAt: now,
          }
        );
      }
    }
  },
});

export const upsertAnalytics = internalMutation({
  args: {
    menuItemId: v.string(),
    menuItemName: v.optional(v.string()),
    period: v.string(),
    totalUnitsSold: v.number(),
    totalRevenue: v.number(),
    totalCost: v.number(),
    totalProfit: v.number(),
    marginPercent: v.optional(v.number()),
    avgDailyUnits: v.number(),
    revenueTrend: v.string(),
    bcgClassification: v.string(),
    recommendation: v.string(),
    pairingRecommendation: v.optional(v.string()),
    pairingItemId: v.optional(v.string()),
    pairingReason: v.optional(v.string()),
    lastOrderDate: v.optional(v.number()),
    computedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productAnalytics")
      .withIndex("by_item_period", (q) =>
        q.eq("menuItemId", args.menuItemId).eq("period", args.period)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("productAnalytics", args);
    }
  },
});

// Manual refresh — callable from admin UI
export const refreshAnalytics = action({
  handler: async (ctx) => {
    await ctx.runAction(internal.productAnalyticsAggregator.computeAnalytics, {});
  },
});
