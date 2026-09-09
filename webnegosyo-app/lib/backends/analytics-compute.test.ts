import {
  computeBundleAnalytics,
  computeCustomerInsights,
  computeOrderHeatmap,
  computePaymentMethodAnalytics,
  computeRevenueBreakdown,
  computeSalesAnalytics,
  computeTopItems,
  computeTrends,
  computeUpsellAnalytics,
  computeUpsellTrends,
  type AnalyticsEvent,
  type AnalyticsItem,
  type AnalyticsOrder,
} from "./analytics-compute";

/**
 * Pure ports of `convex-template/convex/analytics.ts`, so a platform-backend
 * store reads the SAME figures its Convex neighbour would. Every function
 * takes already-fetched rows; no client, no clock — the caller decides both.
 */

// 2026-09-05 10:00 Asia/Manila == 02:00Z
const T0 = Date.parse("2026-09-05T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function order(overrides: Partial<AnalyticsOrder> = {}): AnalyticsOrder {
  return {
    id: "o1",
    createdAtMs: T0,
    status: "completed",
    total: 100,
    source: "web",
    orderType: "Delivery",
    paymentMethod: "GCash",
    customerName: "Ana",
    customerContact: "09171234567",
    customerData: null,
    ...overrides,
  };
}

function item(overrides: Partial<AnalyticsItem> = {}): AnalyticsItem {
  return {
    orderId: "o1",
    menuItemId: "m1",
    menuItemName: "Adobo",
    quantity: 1,
    subtotal: 100,
    isUpsellItem: false,
    ...overrides,
  };
}

function event(type: string, createdAtMs = T0): AnalyticsEvent {
  return { type, createdAtMs };
}

describe("computeUpsellAnalytics", () => {
  it("counts shown/clicked/converted and derives the rates", () => {
    const events = [
      event("upsell_shown"),
      event("upsell_shown"),
      event("upsell_clicked"),
      event("upsell_converted"),
      event("bundle_viewed"),
    ];

    expect(computeUpsellAnalytics(events)).toEqual({
      shown: 2,
      clicked: 1,
      converted: 1,
      clickRate: 0.5,
      conversionRate: 0.5,
    });
  });

  it("reports zero rates with no impressions rather than dividing by zero", () => {
    expect(computeUpsellAnalytics([])).toEqual({
      shown: 0,
      clicked: 0,
      converted: 0,
      clickRate: 0,
      conversionRate: 0,
    });
  });
});

describe("computeBundleAnalytics", () => {
  it("derives bundle conversion from viewed and added events", () => {
    const events = [event("bundle_viewed"), event("bundle_viewed"), event("bundle_added")];

    expect(computeBundleAnalytics(events)).toEqual({ viewed: 2, added: 1, conversionRate: 0.5 });
  });
});

describe("computeTopItems", () => {
  it("aggregates units and revenue per menu item, ranked by revenue", () => {
    const items = [
      item({ menuItemId: "m1", menuItemName: "Adobo", quantity: 2, subtotal: 200 }),
      item({ menuItemId: "m2", menuItemName: "Sinigang", quantity: 5, subtotal: 150 }),
      item({ menuItemId: "m1", menuItemName: "Adobo", quantity: 1, subtotal: 100 }),
    ];

    expect(computeTopItems(items, 10)).toEqual([
      { itemId: "m1", name: "Adobo", count: 3, revenue: 300 },
      { itemId: "m2", name: "Sinigang", count: 5, revenue: 150 },
    ]);
  });

  it("honours the limit", () => {
    const items = [
      item({ menuItemId: "m1", subtotal: 300 }),
      item({ menuItemId: "m2", subtotal: 200 }),
      item({ menuItemId: "m3", subtotal: 100 }),
    ];

    expect(computeTopItems(items, 2)).toHaveLength(2);
  });
});

describe("computeTrends", () => {
  it("buckets non-cancelled orders by the merchant's LOCAL day, oldest first", () => {
    // 23:30 PH on the 4th is 15:30Z on the 4th; 00:30 PH on the 5th is 16:30Z
    // on the 4th. A UTC bucket would put both on the 4th.
    const orders = [
      order({ id: "a", createdAtMs: Date.parse("2026-09-04T15:30:00.000Z"), total: 100 }),
      order({ id: "b", createdAtMs: Date.parse("2026-09-04T16:30:00.000Z"), total: 300 }),
      order({ id: "c", createdAtMs: Date.parse("2026-09-04T17:00:00.000Z"), total: 100 }),
      order({ id: "x", createdAtMs: Date.parse("2026-09-04T17:00:00.000Z"), status: "cancelled", total: 999 }),
    ];

    expect(computeTrends(orders)).toEqual([
      { date: "2026-09-04", totalOrders: 1, totalRevenue: 100, avgOrderValue: 100 },
      { date: "2026-09-05", totalOrders: 2, totalRevenue: 400, avgOrderValue: 200 },
    ]);
  });
});

describe("computeRevenueBreakdown", () => {
  it("groups revenue by order type and payment method, highest first", () => {
    const orders = [
      order({ id: "a", orderType: "Delivery", paymentMethod: "GCash", total: 100 }),
      order({ id: "b", orderType: "Pickup", paymentMethod: "Cash", total: 300 }),
      order({ id: "c", orderType: undefined, paymentMethod: undefined, total: 50 }),
    ];

    expect(computeRevenueBreakdown(orders)).toEqual({
      byOrderType: [
        { type: "Pickup", revenue: 300, count: 1 },
        { type: "Delivery", revenue: 100, count: 1 },
        { type: "Unknown", revenue: 50, count: 1 },
      ],
      byPaymentMethod: [
        { method: "Cash", revenue: 300, count: 1 },
        { method: "GCash", revenue: 100, count: 1 },
        { method: "Unknown", revenue: 50, count: 1 },
      ],
    });
  });
});

describe("computeUpsellTrends", () => {
  it("reports a daily conversion rate and the revenue of upsold lines", () => {
    const events = [
      event("upsell_shown", T0),
      event("upsell_shown", T0),
      event("upsell_converted", T0),
      event("upsell_shown", T0 - DAY),
    ];
    const items = [
      item({ orderId: "o1", isUpsellItem: true, subtotal: 60 }),
      item({ orderId: "o1", isUpsellItem: false, subtotal: 100 }),
    ];

    expect(computeUpsellTrends(events, items)).toEqual({
      dailyRates: [
        { date: "2026-09-04", rate: 0 },
        { date: "2026-09-05", rate: 0.5 },
      ],
      totalUpsellRevenue: 60,
    });
  });
});

describe("computeSalesAnalytics", () => {
  it("separates completed from cancelled and compares against the prior period", () => {
    const current = [
      order({ id: "a", total: 100, source: "web", status: "completed" }),
      order({ id: "b", total: 200, source: "mobile", status: "ready" }),
      order({ id: "c", total: 50, source: "pos", status: "cancelled" }),
    ];
    const previous = [order({ id: "p", total: 150 })];

    expect(computeSalesAnalytics(current, previous)).toEqual({
      totalRevenue: 300,
      totalOrders: 3,
      completedOrders: 2,
      avgOrderValue: 150,
      cancelledOrders: 1,
      cancelledRevenue: 50,
      cancellationRate: 1 / 3,
      ordersBySource: { web: 1, mobile: 1 },
      ordersByStatus: { completed: 1, ready: 1, cancelled: 1 },
      revenueGrowth: 1,
    });
  });

  it("reports zero growth when there is no prior revenue to grow from", () => {
    expect(computeSalesAnalytics([order()], []).revenueGrowth).toBe(0);
  });
});

describe("computePaymentMethodAnalytics", () => {
  it("reports each method's share and a per-day revenue breakdown", () => {
    const orders = [
      order({ id: "a", paymentMethod: "GCash", total: 100 }),
      order({ id: "b", paymentMethod: "GCash", total: 300 }),
      order({ id: "c", paymentMethod: "Cash", total: 100, createdAtMs: T0 - DAY }),
    ];

    expect(computePaymentMethodAnalytics(orders)).toEqual({
      methods: [
        { method: "GCash", count: 2, revenue: 400, percentage: 2 / 3, avgOrderValue: 200 },
        { method: "Cash", count: 1, revenue: 100, percentage: 1 / 3, avgOrderValue: 100 },
      ],
      dailyBreakdown: [
        { date: "2026-09-04", methods: { Cash: 100 } },
        { date: "2026-09-05", methods: { GCash: 400 } },
      ],
    });
  });
});

describe("computeOrderHeatmap", () => {
  it("fills a full 7x24 grid in local time and finds the peak hour", () => {
    // T0 is Saturday 10:00 PH.
    const orders = [order({ id: "a" }), order({ id: "b" }), order({ id: "c", createdAtMs: T0 + DAY })];

    const result = computeOrderHeatmap(orders);

    expect(result.heatmap).toHaveLength(7 * 24);
    expect(result.peakHour).toEqual({ day: 6, hour: 10, count: 2 });
    expect(result.heatmap.find((c) => c.day === 0 && c.hour === 10)?.count).toBe(1);
  });

  it("reports an all-zero quiet hour for a store with no orders", () => {
    expect(computeOrderHeatmap([]).quietHour).toEqual({ day: 0, hour: 0, count: 0 });
  });
});

describe("computeCustomerInsights", () => {
  it("collapses one person's orders onto one identity and tallies walk-ins apart", () => {
    const orders = [
      order({ id: "a", customerContact: "09171234567", total: 100 }),
      // Same phone in a different format is the same person.
      order({ id: "b", customerContact: "+63 917 123 4567", total: 200, createdAtMs: T0 + 1 }),
      order({ id: "c", customerContact: "", customerName: "Walk-in", total: 50 }),
      order({ id: "d", customerContact: "carla@example.com", total: 80 }),
    ];

    const result = computeCustomerInsights(orders);

    expect(result.totalCustomers).toBe(2);
    expect(result.returningCustomers).toBe(1);
    expect(result.newCustomers).toBe(1);
    expect(result.returnRate).toBe(0.5);
    expect(result.walkInOrders).toBe(1);
    expect(result.walkInRevenue).toBe(50);
    expect(result.avgOrdersPerCustomer).toBe(1.5);
    expect(result.avgRevenuePerCustomer).toBe(190);
    expect(result.topCustomers[0]).toEqual({
      name: "Ana",
      contact: "",
      orderCount: 2,
      totalSpent: 300,
      lastOrderDate: T0 + 1,
    });
  });

  it("never exposes a contact in the top-customers list", () => {
    const result = computeCustomerInsights([order()]);

    expect(result.topCustomers.every((c) => c.contact === "")).toBe(true);
  });
});
