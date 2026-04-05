# Product Analytics & Profitability Tracking — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cost tracking to menu items and a data-driven product analytics page that auto-classifies products using the BCG matrix and generates actionable recommendations.

**Architecture:** New Convex tables (`productCosts`, `productAnalytics`) store cost data and aggregated performance stats. A daily cron computes classifications from existing `orderItems` data. Two UI touch points: cost field on the menu item form, and a new Product Analytics admin page.

**Tech Stack:** Convex (mutations, queries, crons), Next.js 15 App Router, React, Shadcn UI, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-product-analytics-design.md`

---

## File Structure

### New Convex Files (`convex-template/convex/`)

| File | Responsibility |
|---|---|
| `productCosts.ts` | Mutations & queries for product cost CRUD |
| `productAnalytics.ts` | Queries for analytics data, portfolio summary, recommendations |
| `productAnalyticsAggregator.ts` | Internal action + mutation for computing analytics from orderItems |

### New App Files

| File | Responsibility |
|---|---|
| `src/hooks/use-convex-product-analytics.ts` | Typed hook wrappers for Convex product queries/mutations (follows `use-convex-orders.ts` pattern) |
| `src/components/admin/product-cost-field.tsx` | Cost input + live margin display (used in menu item form) |
| `src/components/admin/product-mini-performance.tsx` | Collapsible BCG badge + recommendation card (used in menu item form) |
| `src/app/[tenant]/admin/product-analytics/page.tsx` | Product Analytics admin page (server component) |
| `src/components/admin/product-analytics-wrapper.tsx` | Client wrapper: ConvexProvider per tenant |
| `src/components/admin/product-analytics-content.tsx` | Client component: Convex-powered analytics table + portfolio summary |

### Files to Modify

| File | Change |
|---|---|
| `convex-template/convex/schema.ts` | Add `productCosts` + `productAnalytics` table definitions |
| `convex-template/convex/crons.ts` | Add daily cron at 16:00 UTC |
| `src/components/admin/menu-item-form.tsx` | Import and render `ProductCostField` + `ProductMiniPerformance` |
| `src/components/shared/sidebar.tsx` | Add "Product Analytics" nav item + `BarChart3` icon import |
| `src/components/admin/admin-layout-client.tsx` | Pass `menuEngineeringEnabled` flag (already passed, verify) |

---

## Chunk 1: Convex Data Layer

### Task 1: Add tables to Convex schema

**Files:**
- Modify: `convex-template/convex/schema.ts`

- [ ] **Step 1: Add `productCosts` and `productAnalytics` table definitions**

Add these two tables after the existing `pushTokens` table definition:

```typescript
  productCosts: defineTable({
    menuItemId: v.string(),
    costPrice: v.number(),
    costNotes: v.optional(v.string()),
    updatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_item", ["menuItemId"]),

  productAnalytics: defineTable({
    menuItemId: v.string(),
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
  })
    .index("by_item_period", ["menuItemId", "period"]),
```

- [ ] **Step 2: Verify schema compiles**

Run: `cd convex-template && npx convex dev --once --typecheck disable` (or just verify TypeScript: `npx tsc --noEmit`)
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex-template/convex/schema.ts
git commit -m "feat: add productCosts and productAnalytics tables to Convex schema"
```

---

### Task 2: Create productCosts mutations and queries

**Files:**
- Create: `convex-template/convex/productCosts.ts`

- [ ] **Step 1: Create the productCosts module**

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const setCost = mutation({
  args: {
    menuItemId: v.string(),
    costPrice: v.number(),
    costNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productCosts")
      .withIndex("by_item", (q) => q.eq("menuItemId", args.menuItemId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        costPrice: args.costPrice,
        costNotes: args.costNotes,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("productCosts", {
        menuItemId: args.menuItemId,
        costPrice: args.costPrice,
        costNotes: args.costNotes,
        updatedAt: now,
        createdAt: now,
      });
    }
  },
});

export const getCost = query({
  args: {
    menuItemId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productCosts")
      .withIndex("by_item", (q) => q.eq("menuItemId", args.menuItemId))
      .first();
  },
});

export const getAllCosts = query({
  handler: async (ctx) => {
    return await ctx.db.query("productCosts").collect();
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd convex-template && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex-template/convex/productCosts.ts
git commit -m "feat: add productCosts mutations and queries"
```

---

### Task 3: Create productAnalytics queries

**Files:**
- Create: `convex-template/convex/productAnalytics.ts`

- [ ] **Step 1: Create the productAnalytics query module**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd convex-template && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex-template/convex/productAnalytics.ts
git commit -m "feat: add productAnalytics queries (getAll, getByItem, getPortfolioSummary)"
```

---

### Task 4: Create productAnalyticsAggregator

**Files:**
- Create: `convex-template/convex/productAnalyticsAggregator.ts`

This is the core computation engine. It reads `orderItems` + `productCosts`, computes BCG classifications, generates recommendations, and stores results.

- [ ] **Step 1: Create the aggregator module**

```typescript
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
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
      product.avgDailyUnits > medianSales &&
      product.marginPercent > medianMargin
    ) {
      product.bcgClassification = "star";
    } else if (
      product.avgDailyUnits > medianSales &&
      product.marginPercent <= medianMargin
    ) {
      product.bcgClassification = "plowhorse";
    } else if (
      product.avgDailyUnits <= medianSales &&
      product.marginPercent > medianMargin
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
      // Pair with highest-margin Puzzle
      const puzzles = others.filter((p) => p.bcgClassification === "puzzle");
      target = puzzles.sort(
        (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
      )[0];
      if (!target) {
        // Fallback: any highest-margin item
        target = others.sort(
          (a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0)
        )[0];
      }
      reason = target
        ? `Pair with ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) as an upsell — your Star's popularity will boost its visibility.`
        : "";
      break;
    }

    case "plowhorse": {
      // Pair with highest-margin Star or Puzzle
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
        ? `Bundle with ${target.menuItemName} (${target.bcgClassification}, ${target.marginPercent?.toFixed(1)}% margin) as a meal deal to improve combined margin.`
        : "";
      break;
    }

    case "puzzle": {
      // Pair with highest-sales Star or Plowhorse
      const highSales = others.filter(
        (p) =>
          p.bcgClassification === "star" || p.bcgClassification === "plowhorse"
      );
      target = highSales.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      if (!target) {
        target = others.sort((a, b) => b.avgDailyUnits - a.avgDailyUnits)[0];
      }
      reason = target
        ? `Pair with ${target.menuItemName} (${target.bcgClassification}, ${target.avgDailyUnits.toFixed(1)} units/day) — its traffic will expose customers to this high-margin item.`
        : "";
      break;
    }

    case "dog": {
      // Pair with highest-sales Star
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
        ? `If keeping, bundle with ${target.menuItemName} (${target.bcgClassification}) as a combo deal to move inventory.`
        : "";
      break;
    }
  }

  if (!target || !reason) return null;

  return {
    recommendation: `Consider pairing with ${target.menuItemName}.`,
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
      const orderIds = new Set(periodOrders.map((o: { _id: string }) => o._id));

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
      let trendMap = new Map<string, string>();
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
export const refreshAnalytics = internalAction({
  handler: async (ctx) => {
    await ctx.runAction(internal.productAnalyticsAggregator.computeAnalytics, {});
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd convex-template && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex-template/convex/productAnalyticsAggregator.ts
git commit -m "feat: add product analytics aggregator with BCG classification and recommendations"
```

---

### Task 5: Add cron job

**Files:**
- Modify: `convex-template/convex/crons.ts`

- [ ] **Step 1: Add the product analytics cron**

Add after the existing `crons.daily(...)` call, before `export default crons;`:

```typescript
crons.daily(
  "aggregate product analytics",
  { hourUTC: 16, minuteUTC: 0 },
  internal.productAnalyticsAggregator.computeAnalytics
);
```

The file should now look like:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "aggregate daily stats",
  { hourUTC: 23, minuteUTC: 59 },
  internal.statsAggregator.aggregateToday
);

crons.daily(
  "aggregate product analytics",
  { hourUTC: 16, minuteUTC: 0 },
  internal.productAnalyticsAggregator.computeAnalytics
);

export default crons;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd convex-template && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex-template/convex/crons.ts
git commit -m "feat: add daily product analytics cron at 16:00 UTC (midnight PH)"
```

---

## Chunk 2: Admin UI — Cost Field & Mini Performance

### Task 6: Create Convex hook wrappers for product analytics

**Files:**
- Create: `src/hooks/use-convex-product-analytics.ts`

This follows the exact same pattern as `src/hooks/use-convex-orders.ts` — string-based function references since the main app doesn't have access to Convex's generated types.

- [ ] **Step 1: Create the hooks file**

```typescript
"use client";

import { useQuery, useMutation } from "convex/react";
import { FunctionReference } from "convex/server";

// String-based function references (same pattern as use-convex-orders.ts)
const getCostRef = "productCosts:getCost" as unknown as FunctionReference<"query">;
const setCostRef = "productCosts:setCost" as unknown as FunctionReference<"mutation">;
const getAllCostsRef = "productCosts:getAllCosts" as unknown as FunctionReference<"query">;
const getAllAnalyticsRef = "productAnalytics:getAll" as unknown as FunctionReference<"query">;
const getByItemRef = "productAnalytics:getByItem" as unknown as FunctionReference<"query">;
const getPortfolioSummaryRef = "productAnalytics:getPortfolioSummary" as unknown as FunctionReference<"query">;

export function useProductCost(menuItemId: string) {
  return useQuery(getCostRef, { menuItemId });
}

export function useSetProductCost() {
  return useMutation(setCostRef);
}

export function useAllProductCosts() {
  return useQuery(getAllCostsRef);
}

export function useProductAnalytics(period?: string) {
  return useQuery(getAllAnalyticsRef, { period: period ?? "30d" });
}

export function useProductAnalyticsByItem(menuItemId: string, period?: string) {
  return useQuery(getByItemRef, { menuItemId, period: period ?? "30d" });
}

export function usePortfolioSummary(period?: string) {
  return useQuery(getPortfolioSummaryRef, { period: period ?? "30d" });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint -- --no-error-on-unmatched-pattern src/hooks/use-convex-product-analytics.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-convex-product-analytics.ts
git commit -m "feat: add Convex hook wrappers for product costs and analytics"
```

---

### Task 7: Create ProductCostField component

**Files:**
- Create: `src/components/admin/product-cost-field.tsx`

This component renders the cost price input with live margin calculation. It reads/writes to Convex `productCosts`.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useProductCost, useSetProductCost } from '@/hooks/use-convex-product-analytics'
import { toast } from 'sonner'

interface ProductCostFieldProps {
  menuItemId: string
  currentPrice: number
  discountedPrice?: number
}

export function ProductCostField({
  menuItemId,
  currentPrice,
  discountedPrice,
}: ProductCostFieldProps) {
  const costData = useProductCost(menuItemId)
  const setCost = useSetProductCost()

  const [costPrice, setCostPrice] = useState('')
  const [costNotes, setCostNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (costData) {
      setCostPrice(costData.costPrice.toString())
      setCostNotes(costData.costNotes || '')
    }
  }, [costData])

  const effectivePrice = discountedPrice && discountedPrice > 0 ? discountedPrice : currentPrice
  const cost = parseFloat(costPrice)
  const hasCost = !isNaN(cost) && cost > 0
  const profit = hasCost ? effectivePrice - cost : 0
  const marginPercent = hasCost && effectivePrice > 0
    ? Math.round((profit / effectivePrice) * 1000) / 10
    : 0

  const handleSave = useCallback(async () => {
    if (!hasCost) return
    setIsSaving(true)
    try {
      await setCost({
        menuItemId,
        costPrice: cost,
        costNotes: costNotes || undefined,
      })
      toast.success('Cost price saved')
    } catch {
      toast.error('Failed to save cost price')
    } finally {
      setIsSaving(false)
    }
  }, [hasCost, cost, costNotes, menuItemId, setCost])

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Cost & Margin Analysis</Label>
        {hasCost && (
          <Badge
            variant={marginPercent >= 40 ? 'default' : marginPercent >= 20 ? 'secondary' : 'destructive'}
          >
            {marginPercent}% margin
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cost_price">Cost Price ($)</Label>
          <Input
            id="cost_price"
            type="number"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            onBlur={handleSave}
            placeholder="What it costs to make"
          />
        </div>

        {hasCost && (
          <div className="space-y-2">
            <Label>Projected Profit</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm">
              <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                {profit >= 0 ? '+' : ''}₱{Math.round(profit)} per unit ({marginPercent}%)
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cost_notes">Cost Notes</Label>
        <Textarea
          id="cost_notes"
          value={costNotes}
          onChange={(e) => setCostNotes(e.target.value)}
          onBlur={handleSave}
          placeholder="Optional notes (e.g., 'supplier raised price')"
          rows={2}
          className="text-sm"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint -- --no-error-on-unmatched-pattern src/components/admin/product-cost-field.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/product-cost-field.tsx
git commit -m "feat: add ProductCostField component with live margin calculation"
```

---

### Task 7: Create ProductMiniPerformance component

**Files:**
- Create: `src/components/admin/product-mini-performance.tsx`

Collapsible card that shows BCG classification + recommendation on the menu item edit page.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useProductAnalyticsByItem } from '@/hooks/use-convex-product-analytics'

interface ProductMiniPerformanceProps {
  menuItemId: string
}

const bcgLabels: Record<string, { label: string; color: string; description: string }> = {
  star: { label: 'Star', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', description: 'High popularity, high profit' },
  plowhorse: { label: 'Plowhorse', color: 'bg-blue-100 text-blue-800 border-blue-300', description: 'High popularity, low profit' },
  puzzle: { label: 'Puzzle', color: 'bg-purple-100 text-purple-800 border-purple-300', description: 'Low popularity, high profit' },
  dog: { label: 'Dog', color: 'bg-red-100 text-red-800 border-red-300', description: 'Low popularity, low profit' },
  unclassified: { label: 'Unclassified', color: 'bg-gray-100 text-gray-800 border-gray-300', description: 'Not enough data yet' },
}

const trendIcons: Record<string, React.ReactNode> = {
  growing: <TrendingUp className="h-4 w-4 text-green-600" />,
  declining: <TrendingDown className="h-4 w-4 text-red-600" />,
  stable: <Minus className="h-4 w-4 text-gray-500" />,
}

export function ProductMiniPerformance({ menuItemId }: ProductMiniPerformanceProps) {
  const analytics = useProductAnalyticsByItem(menuItemId, '30d')
  const [isExpanded, setIsExpanded] = useState(false)

  if (!analytics) return null

  const bcg = bcgLabels[analytics.bcgClassification] ?? bcgLabels.unclassified

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Performance</span>
          <Badge variant="outline" className={bcg.color}>
            {bcg.label}
          </Badge>
          {trendIcons[analytics.revenueTrend]}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          <span className="ml-1 text-xs">
            {isExpanded ? 'Hide' : 'Details'}
          </span>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold">{analytics.totalUnitsSold}</p>
          <p className="text-xs text-muted-foreground">Units Sold</p>
        </div>
        <div>
          <p className="text-lg font-bold">₱{Math.round(analytics.totalRevenue).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Revenue</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${(analytics.marginPercent ?? 0) >= 40 ? 'text-green-600' : (analytics.marginPercent ?? 0) >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {analytics.marginPercent !== undefined ? `${analytics.marginPercent}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Margin</p>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2 border-t pt-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Recommendation</p>
            <p className="text-sm text-muted-foreground mt-1">{analytics.recommendation}</p>
          </div>
          {analytics.pairingReason && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm font-medium">Pairing Suggestion</p>
              <p className="text-sm text-muted-foreground mt-1">{analytics.pairingReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint -- --no-error-on-unmatched-pattern src/components/admin/product-mini-performance.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/product-mini-performance.tsx
git commit -m "feat: add ProductMiniPerformance component with BCG badge and recommendations"
```

---

### Task 8: Integrate cost field and performance card into menu item form

**Files:**
- Modify: `src/components/admin/menu-item-form.tsx`

**Important:** `ProductCostField` and `ProductMiniPerformance` use Convex hooks (`useQuery`, `useMutation`), which require a `ConvexProvider` ancestor. The menu item form needs a ConvexProvider wrapper when `convexUrl` is available.

- [ ] **Step 1: Add imports at the top of the file**

After the existing imports (around line 16), add:

```typescript
import { ConvexProvider } from 'convex/react'
import { getConvexClient } from '@/lib/convex/client'
import { ProductCostField } from '@/components/admin/product-cost-field'
import { ProductMiniPerformance } from '@/components/admin/product-mini-performance'
```

- [ ] **Step 2: Add convexUrl prop to MenuItemFormProps**

In the `MenuItemFormProps` interface (around line 19), add `convexUrl`:

```typescript
interface MenuItemFormProps {
  item?: MenuItem
  categories: Category[]
  tenantId: string
  tenantSlug: string
  menuEngineeringEnabled?: boolean
  convexUrl?: string
}
```

Update the component destructuring (around line 53):

```typescript
export function MenuItemForm({ item, categories, tenantId, tenantSlug, menuEngineeringEnabled, convexUrl }: MenuItemFormProps) {
```

- [ ] **Step 3: Add the cost field and mini performance after the price fields**

After the closing `</div>` of the price grid (the `grid gap-4 sm:grid-cols-2` div that contains Price and Discounted Price, around line 363), add a ConvexProvider-wrapped section:

```tsx
          {convexUrl && (() => {
            const client = getConvexClient(convexUrl)
            return (
              <ConvexProvider client={client}>
                <ProductCostField
                  menuItemId={item?.id || ''}
                  currentPrice={parseFloat(formData.price) || 0}
                  discountedPrice={parseFloat(formData.discounted_price) || undefined}
                />
                {item?.id && (
                  <ProductMiniPerformance menuItemId={item.id} />
                )}
              </ConvexProvider>
            )
          })()}
```

This follows the same pattern as `ConvexOrdersWrapper` — creates a cached Convex client per `convexUrl` and wraps the Convex-dependent components.

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/menu-item-form.tsx
git commit -m "feat: integrate cost field and performance card into menu item form"
```

---

## Chunk 3: Admin UI — Product Analytics Page

### Task 10: Create product analytics content component

**Files:**
- Create: `src/components/admin/product-analytics-content.tsx`

This is the main Convex-powered client component with the portfolio summary and product table.

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useProductAnalytics, usePortfolioSummary } from '@/hooks/use-convex-product-analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Star,
  HelpCircle,
  Tractor,
  Dog,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

const bcgConfig: Record<string, {
  label: string
  icon: React.ReactNode
  bgColor: string
  textColor: string
  borderColor: string
  description: string
}> = {
  star: {
    label: 'Stars',
    icon: <Star className="h-4 w-4" />,
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-300',
    description: 'High popularity, high profit',
  },
  puzzle: {
    label: 'Puzzles',
    icon: <HelpCircle className="h-4 w-4" />,
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-300',
    description: 'Low popularity, high profit',
  },
  plowhorse: {
    label: 'Plowhorses',
    icon: <Tractor className="h-4 w-4" />,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300',
    description: 'High popularity, low profit',
  },
  dog: {
    label: 'Dogs',
    icon: <Dog className="h-4 w-4" />,
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
    borderColor: 'border-red-300',
    description: 'Low popularity, low profit',
  },
}

const trendIcons: Record<string, React.ReactNode> = {
  growing: <TrendingUp className="h-4 w-4 text-green-600" />,
  declining: <TrendingDown className="h-4 w-4 text-red-600" />,
  stable: <Minus className="h-4 w-4 text-gray-500" />,
}

function MarginBadge({ margin }: { margin: number | undefined }) {
  if (margin === undefined) return <span className="text-muted-foreground">—</span>
  const color =
    margin >= 40 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-medium ${color}`}>{margin.toFixed(1)}%</span>
}

export function ProductAnalyticsContent() {
  const [period, setPeriod] = useState('30d')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [sortField, setSortField] = useState<string>('totalRevenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const analytics = useProductAnalytics(period)
  const summary = usePortfolioSummary(period)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    toast.info('Refreshing analytics... this may take a moment.')
    // The refresh is triggered server-side. Since we can't call internal actions
    // from client, we rely on the cron or a public mutation wrapper.
    // For now, show a message to wait for the cron or use Convex dashboard.
    setTimeout(() => {
      setIsRefreshing(false)
      toast.success('Analytics will refresh on the next cron cycle, or use the Convex dashboard to trigger manually.')
    }, 2000)
  }

  const sorted = analytics
    ? [...analytics].sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortField] as number ?? 0
        const bVal = (b as Record<string, unknown>)[sortField] as number ?? 0
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal
      })
    : []

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        )}
      </div>
    </TableHead>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Product Analytics</h1>
          <p className="text-muted-foreground">
            Data-driven insights to optimize your menu profitability
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Portfolio Summary — BCG Quadrant Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['star', 'puzzle', 'plowhorse', 'dog'] as const).map((cls) => {
              const config = bcgConfig[cls]
              const count = summary.counts[cls]
              return (
                <Card key={cls} className={`${config.bgColor} ${config.borderColor} border`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {config.icon}
                      <span className={`font-semibold ${config.textColor}`}>
                        {config.label}
                      </span>
                      <span className="text-muted-foreground">({count})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Health summary */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {summary.starRevenuePercent}% of revenue comes from Stars
            </span>
            {summary.lowMarginPlowhorses.length > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.lowMarginPlowhorses.length} Plowhorse{summary.lowMarginPlowhorses.length > 1 ? 's' : ''} below 15% margin
              </Badge>
            )}
          </div>
        </>
      )}

      {/* Product Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No analytics data yet.</p>
              <p className="text-sm mt-1">
                Add cost prices to your menu items and wait for orders to flow in.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <SortHeader field="totalRevenue">Revenue</SortHeader>
                  <SortHeader field="totalUnitsSold">Units Sold</SortHeader>
                  <SortHeader field="marginPercent">Margin %</SortHeader>
                  <SortHeader field="avgDailyUnits">Avg/Day</SortHeader>
                  <TableHead>Trend</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((item) => {
                  const bcg = bcgConfig[item.bcgClassification]
                  const isExpanded = expandedItem === item.menuItemId

                  return (
                    <>
                      <TableRow
                        key={item.menuItemId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedItem(isExpanded ? null : item.menuItemId)
                        }
                      >
                        <TableCell className="font-medium">
                          {item.menuItemId}
                        </TableCell>
                        <TableCell>
                          ₱{Math.round(item.totalRevenue).toLocaleString()}
                        </TableCell>
                        <TableCell>{item.totalUnitsSold}</TableCell>
                        <TableCell>
                          <MarginBadge margin={item.marginPercent} />
                        </TableCell>
                        <TableCell>{item.avgDailyUnits}</TableCell>
                        <TableCell>
                          {trendIcons[item.revenueTrend] ?? trendIcons.stable}
                        </TableCell>
                        <TableCell>
                          {bcg ? (
                            <Badge
                              variant="outline"
                              className={`${bcg.bgColor} ${bcg.textColor} ${bcg.borderColor}`}
                            >
                              {bcg.icon}
                              <span className="ml-1">{bcg.label}</span>
                            </Badge>
                          ) : (
                            <Badge variant="outline">Unclassified</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${item.menuItemId}-details`}>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            <div className="space-y-3">
                              <div className="rounded-md bg-background p-3 border">
                                <p className="text-sm font-medium">Recommendation</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {item.recommendation}
                                </p>
                              </div>
                              {item.pairingReason && (
                                <div className="rounded-md bg-background p-3 border">
                                  <p className="text-sm font-medium">
                                    Pairing Suggestion
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {item.pairingReason}
                                  </p>
                                </div>
                              )}
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>
                                  Cost: ₱{Math.round(item.totalCost).toLocaleString()}
                                </span>
                                <span>
                                  Profit: ₱{Math.round(item.totalProfit).toLocaleString()}
                                </span>
                                {item.lastOrderDate && (
                                  <span>
                                    Last order:{' '}
                                    {new Date(item.lastOrderDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint -- --no-error-on-unmatched-pattern src/components/admin/product-analytics-content.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/product-analytics-content.tsx
git commit -m "feat: add ProductAnalyticsContent component with portfolio summary and sortable table"
```

---

### Task 11: Create Product Analytics page

**Files:**
- Create: `src/app/[tenant]/admin/product-analytics/page.tsx`

Server component that wraps the client content with ConvexProvider.

- [ ] **Step 1: Create the page**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConvexProvider } from 'convex/react'
import { ProductAnalyticsContent } from '@/components/admin/product-analytics-content'
import { getConvexClient } from '@/lib/convex/client'

interface ProductAnalyticsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function ProductAnalyticsPage({ params }: ProductAnalyticsPageProps) {
  const { tenant } = await params
  const supabase = await createClient()

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, convex_deployment_url, menu_engineering_enabled')
    .eq('slug', tenant)
    .single()

  if (!tenantData?.menu_engineering_enabled) {
    redirect(`/${tenant}/admin`)
  }

  if (!tenantData?.convex_deployment_url) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Product Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Product analytics requires Convex to be configured for this tenant.
          Please contact support to enable real-time features.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <ConvexProductAnalytics convexUrl={tenantData.convex_deployment_url} />
    </div>
  )
}

function ConvexProductAnalytics({ convexUrl }: { convexUrl: string }) {
  'use client'

  // This needs to be a separate client component
  // See note in Step 2
  return <ProductAnalyticsContent />
}
```

**Important:** The page needs a client wrapper for ConvexProvider. Create a small wrapper:

- [ ] **Step 2: Create the Convex wrapper for the page**

Replace the page with the correct server/client split. Update the page to:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProductAnalyticsWrapper } from '@/components/admin/product-analytics-wrapper'

interface ProductAnalyticsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function ProductAnalyticsPage({ params }: ProductAnalyticsPageProps) {
  const { tenant } = await params
  const supabase = await createClient()

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, convex_deployment_url, menu_engineering_enabled')
    .eq('slug', tenant)
    .single()

  if (!tenantData?.menu_engineering_enabled) {
    redirect(`/${tenant}/admin`)
  }

  if (!tenantData?.convex_deployment_url) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Product Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Product analytics requires Convex to be configured for this tenant.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <ProductAnalyticsWrapper convexUrl={tenantData.convex_deployment_url} />
    </div>
  )
}
```

Then create the wrapper component at `src/components/admin/product-analytics-wrapper.tsx`:

```tsx
'use client'

import { ConvexProvider } from 'convex/react'
import { getConvexClient } from '@/lib/convex/client'
import { ProductAnalyticsContent } from '@/components/admin/product-analytics-content'

interface ProductAnalyticsWrapperProps {
  convexUrl: string
}

export function ProductAnalyticsWrapper({ convexUrl }: ProductAnalyticsWrapperProps) {
  const client = getConvexClient(convexUrl)
  return (
    <ConvexProvider client={client}>
      <ProductAnalyticsContent />
    </ConvexProvider>
  )
}
```

- [ ] **Step 3: Verify both files compile**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[tenant]/admin/product-analytics/page.tsx src/components/admin/product-analytics-wrapper.tsx
git commit -m "feat: add Product Analytics admin page with Convex provider wrapper"
```

---

### Task 12: Add Product Analytics to admin sidebar

**Files:**
- Modify: `src/components/shared/sidebar.tsx`

- [ ] **Step 1: Add BarChart3 to lucide imports**

In the import from `lucide-react` (line 6-19), add `BarChart3`:

```typescript
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Store,
  ShoppingBag,
  CreditCard,
  TrendingUp,
  Package,
  Paintbrush,
  BarChart3,
} from 'lucide-react'
```

- [ ] **Step 2: Add the Product Analytics item to adminSidebarItems**

After the `Menu Engineering` entry (around line 157) and before `Bundles`, add:

```typescript
  {
    label: 'Product Analytics',
    href: '/admin/product-analytics',
    icon: BarChart3,
  },
```

- [ ] **Step 3: Gate it behind menuEngineeringEnabled**

The existing filter at lines 49-51 checks for `/menu-engineering`. Update that block to ALSO filter `/product-analytics`. Replace the existing filter:

```typescript
  if (menuEngineeringEnabled === false || menuEngineeringEnabled === undefined) {
    filteredItems = filteredItems.filter(item =>
      !item.href.includes('/menu-engineering') && !item.href.includes('/product-analytics')
    )
  }
```

This combines both checks in a single filter, keeping the logic clean.

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/sidebar.tsx
git commit -m "feat: add Product Analytics link to admin sidebar navigation"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run full lint check**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev` (manual check — verify no build errors in terminal)
Expected: Server starts without errors

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any lint or type errors from product analytics feature"
```
