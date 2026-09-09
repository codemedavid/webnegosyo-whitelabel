import {
  computeProductAnalytics,
  resolveProductPeriod,
  summarizePortfolio,
  type ProductCost,
  type ProductOrder,
  type ProductOrderItem,
} from "./product-analytics-compute";

/**
 * Pure port of `convex-template/convex/productAnalyticsAggregator.ts`. On
 * Convex the classification is computed by a cron/action and STORED; on the
 * platform backend it is computed live from the same inputs, so a platform
 * store's BCG matrix must match what Convex would have written.
 */

const NOW = Date.parse("2026-09-05T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function order(id: string, daysAgo: number, status = "completed"): ProductOrder {
  return { id, createdAtMs: NOW - daysAgo * DAY, status };
}

function line(orderId: string, menuItemId: string, quantity: number, subtotal: number): ProductOrderItem {
  return { orderId, menuItemId, menuItemName: `Item ${menuItemId}`, quantity, subtotal };
}

describe("resolveProductPeriod", () => {
  it("accepts the three periods the screens send and defaults the rest to 30d", () => {
    expect(resolveProductPeriod("7d")).toBe("7d");
    expect(resolveProductPeriod("all")).toBe("all");
    expect(resolveProductPeriod(undefined)).toBe("30d");
    expect(resolveProductPeriod("drop table")).toBe("30d");
  });
});

describe("computeProductAnalytics", () => {
  it("aggregates units and revenue per item within the period only", () => {
    const orders = [order("in", 2), order("out", 40), order("cancelled", 1, "cancelled")];
    const items = [
      line("in", "m1", 2, 200),
      line("out", "m1", 9, 900),
      line("cancelled", "m1", 9, 900),
    ];

    const rows = computeProductAnalytics({ orders, items, costs: [], period: "30d", nowMs: NOW });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuItemId: "m1",
      menuItemName: "Item m1",
      period: "30d",
      totalUnitsSold: 2,
      totalRevenue: 200,
      avgDailyUnits: 0.1,
      bcgClassification: "unclassified",
      lastOrderDate: NOW - 2 * DAY,
      computedAt: NOW,
    });
  });

  it("leaves everything unclassified until two costed items clear the minimum units", () => {
    const orders = [order("o", 1)];
    const items = [line("o", "m1", 10, 1000), line("o", "m2", 10, 500)];
    const costs: ProductCost[] = [{ menuItemId: "m1", costPrice: 20 }];

    const rows = computeProductAnalytics({ orders, items, costs, period: "7d", nowMs: NOW });

    expect(rows.map((r) => r.bcgClassification)).toEqual(["unclassified", "unclassified"]);
    expect(rows.find((r) => r.menuItemId === "m1")?.marginPercent).toBe(80);
    expect(rows.find((r) => r.menuItemId === "m2")?.marginPercent).toBeUndefined();
  });

  it("splits costed items into the four BCG quadrants around the medians", () => {
    const orders = [order("o", 1)];
    // star: high units, high margin; plowhorse: high units, low margin;
    // puzzle: low units, high margin; dog: low units, low margin.
    const items = [
      line("o", "star", 100, 10000),
      line("o", "plow", 100, 10000),
      line("o", "puzzle", 10, 1000),
      line("o", "dog", 10, 1000),
    ];
    const costs: ProductCost[] = [
      { menuItemId: "star", costPrice: 20 },
      { menuItemId: "plow", costPrice: 80 },
      { menuItemId: "puzzle", costPrice: 20 },
      { menuItemId: "dog", costPrice: 80 },
    ];

    const rows = computeProductAnalytics({ orders, items, costs, period: "7d", nowMs: NOW });
    const byId = Object.fromEntries(rows.map((r) => [r.menuItemId, r]));

    expect(byId.star.bcgClassification).toBe("star");
    expect(byId.plow.bcgClassification).toBe("plowhorse");
    expect(byId.puzzle.bcgClassification).toBe("puzzle");
    expect(byId.dog.bcgClassification).toBe("dog");
    expect(byId.star.recommendation).toMatch(/Protect/);
    expect(byId.dog.recommendation).toMatch(/Not selling/);
    expect(byId.star.pairingItemId).toBe("puzzle");
  });

  it("marks a 7d item growing when it outsold the previous week", () => {
    const orders = [order("now", 1), order("prev", 10)];
    const items = [line("now", "m1", 20, 2000), line("prev", "m1", 5, 500)];

    const rows = computeProductAnalytics({ orders, items, costs: [], period: "7d", nowMs: NOW });

    expect(rows[0].revenueTrend).toBe("growing");
    // The prior-week order is outside the period and must not count.
    expect(rows[0].totalUnitsSold).toBe(20);
  });

  it("measures the all-time period against the store's own trading span", () => {
    const orders = [order("first", 20), order("last", 0)];
    const items = [line("first", "m1", 10, 100), line("last", "m1", 10, 100)];

    const rows = computeProductAnalytics({ orders, items, costs: [], period: "all", nowMs: NOW });

    // 20 units over a 20-day span.
    expect(rows[0].avgDailyUnits).toBe(1);
  });

  it("ignores line items with no menu item id", () => {
    const orders = [order("o", 1)];
    const items = [{ ...line("o", "", 1, 10), menuItemId: null }];

    expect(computeProductAnalytics({ orders, items, costs: [], period: "30d", nowMs: NOW })).toEqual([]);
  });
});

describe("summarizePortfolio", () => {
  it("counts each quadrant and the stars' share of revenue", () => {
    const rows = computeProductAnalytics({
      orders: [order("o", 1)],
      items: [
        line("o", "star", 100, 10000),
        line("o", "plow", 100, 10000),
        line("o", "puzzle", 10, 1000),
        line("o", "dog", 10, 1000),
      ],
      costs: [
        { menuItemId: "star", costPrice: 20 },
        { menuItemId: "plow", costPrice: 90 },
        { menuItemId: "puzzle", costPrice: 20 },
        { menuItemId: "dog", costPrice: 90 },
      ],
      period: "30d",
      nowMs: NOW,
    });

    const summary = summarizePortfolio(rows);

    expect(summary.counts).toEqual({ star: 1, plowhorse: 1, puzzle: 1, dog: 1, unclassified: 0 });
    expect(summary.totalProducts).toBe(4);
    expect(summary.starRevenuePercent).toBe(45.5);
    expect(summary.lowMarginPlowhorses).toEqual([{ menuItemId: "plow", marginPercent: 10 }]);
  });
});
