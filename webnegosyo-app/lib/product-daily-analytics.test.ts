import {
  buildProductAnalytics,
  computeProductDeltas,
  previousWindow,
  productDateKey,
  DEFAULT_TZ_OFFSET_MS,
  type DailyOrderInput,
  type DailyOrderItemInput,
} from "./product-daily-analytics";

// 2026-07-28T02:00:00Z === 2026-07-28 10:00 Manila
const JUL_28_MORNING = Date.UTC(2026, 6, 28, 2, 0, 0);
// 2026-07-28T17:30:00Z === 2026-07-29 01:30 Manila (next local day)
const JUL_28_LATE_UTC = Date.UTC(2026, 6, 28, 17, 30, 0);
// 2026-07-27T02:00:00Z === 2026-07-27 10:00 Manila
const JUL_27_MORNING = Date.UTC(2026, 6, 27, 2, 0, 0);

const DAY_MS = 24 * 60 * 60 * 1000;

function order(overrides: Partial<DailyOrderInput> & { id: string }): DailyOrderInput {
  return {
    createdAtMs: JUL_28_MORNING,
    status: "delivered",
    source: "web",
    ...overrides,
  };
}

function item(
  overrides: Partial<DailyOrderItemInput> & { orderId: string; menuItemId: string }
): DailyOrderItemInput {
  return {
    menuItemName: "Latte",
    quantity: 1,
    subtotal: 100,
    ...overrides,
  };
}

describe("productDateKey", () => {
  it("buckets an instant into the merchant's local (UTC+8) calendar day", () => {
    expect(productDateKey(JUL_28_MORNING)).toBe("2026-07-28");
  });

  it("rolls late-evening UTC into the next local day", () => {
    // 17:30 UTC is already 01:30 the next morning in Manila.
    expect(productDateKey(JUL_28_LATE_UTC)).toBe("2026-07-29");
  });

  it("honours an explicit offset", () => {
    expect(productDateKey(JUL_28_LATE_UTC, 0)).toBe("2026-07-28");
    expect(DEFAULT_TZ_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe("buildProductAnalytics — daily grain", () => {
  it("returns no days and no totals for empty input", () => {
    const result = buildProductAnalytics([], [], { metric: "sales" });
    expect(result.days).toEqual([]);
    expect(result.totals).toEqual([]);
  });

  it("reports units, distinct orders, and sales per product per day", () => {
    const orders = [order({ id: "o1" }), order({ id: "o2" })];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 2, subtotal: 200 }),
      item({ orderId: "o2", menuItemId: "latte", quantity: 1, subtotal: 100 }),
    ];

    const { days } = buildProductAnalytics(orders, items, { metric: "sales" });

    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-28");
    expect(days[0].rows).toEqual([
      expect.objectContaining({
        menuItemId: "latte",
        menuItemName: "Latte",
        units: 3,
        orders: 2,
        sales: 300,
      }),
    ]);
  });

  it("counts a product appearing twice in one order as a single order", () => {
    const orders = [order({ id: "o1" })];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 1, subtotal: 100 }),
      item({ orderId: "o1", menuItemId: "latte", quantity: 2, subtotal: 200 }),
    ];

    const { days } = buildProductAnalytics(orders, items, { metric: "sales" });

    expect(days[0].rows[0]).toEqual(
      expect.objectContaining({ units: 3, orders: 1, sales: 300 })
    );
  });

  it("splits the same product across separate local days", () => {
    const orders = [
      order({ id: "o1", createdAtMs: JUL_27_MORNING }),
      order({ id: "o2", createdAtMs: JUL_28_MORNING }),
    ];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 1, subtotal: 100 }),
      item({ orderId: "o2", menuItemId: "latte", quantity: 5, subtotal: 500 }),
    ];

    const { days } = buildProductAnalytics(orders, items, { metric: "sales" });

    // Newest day first.
    expect(days.map((d) => d.date)).toEqual(["2026-07-28", "2026-07-27"]);
    expect(days[0].rows[0].units).toBe(5);
    expect(days[1].rows[0].units).toBe(1);
  });

  it("reports the day's own totals alongside the product rows", () => {
    const orders = [order({ id: "o1" }), order({ id: "o2" })];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 2, subtotal: 200 }),
      item({ orderId: "o2", menuItemId: "cake", menuItemName: "Cake", quantity: 1, subtotal: 150 }),
    ];

    const { days } = buildProductAnalytics(orders, items, { metric: "sales" });

    expect(days[0].totalUnits).toBe(3);
    expect(days[0].totalSales).toBe(350);
    expect(days[0].totalOrders).toBe(2);
  });

  it("drops items whose parent order is missing", () => {
    const { days } = buildProductAnalytics(
      [order({ id: "o1" })],
      [item({ orderId: "ghost", menuItemId: "latte" })],
      { metric: "sales" }
    );
    expect(days).toEqual([]);
  });

  it("ignores non-finite quantities and subtotals instead of producing NaN", () => {
    const { days } = buildProductAnalytics(
      [order({ id: "o1" })],
      [
        item({
          orderId: "o1",
          menuItemId: "latte",
          quantity: Number.NaN,
          subtotal: Number.POSITIVE_INFINITY,
        }),
      ],
      { metric: "sales" }
    );
    expect(days[0].rows[0]).toEqual(expect.objectContaining({ units: 0, sales: 0 }));
  });
});

describe("buildProductAnalytics — order-level filters", () => {
  it("excludes cancelled orders from every metric", () => {
    const orders = [order({ id: "o1" }), order({ id: "o2", status: "cancelled" })];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 1, subtotal: 100 }),
      item({ orderId: "o2", menuItemId: "latte", quantity: 9, subtotal: 900 }),
    ];

    const { totals } = buildProductAnalytics(orders, items, { metric: "sales" });

    expect(totals).toHaveLength(1);
    expect(totals[0]).toEqual(expect.objectContaining({ units: 1, sales: 100, orders: 1 }));
  });

  it("keeps orders on the start boundary and drops orders on the end boundary", () => {
    const orders = [
      order({ id: "start", createdAtMs: JUL_27_MORNING }),
      order({ id: "end", createdAtMs: JUL_28_MORNING }),
    ];
    const items = [
      item({ orderId: "start", menuItemId: "latte" }),
      item({ orderId: "end", menuItemId: "latte" }),
    ];

    const { totals } = buildProductAnalytics(orders, items, {
      metric: "sales",
      startMs: JUL_27_MORNING,
      endMs: JUL_28_MORNING,
    });

    expect(totals[0].orders).toBe(1);
  });

  it("filters to the selected order sources", () => {
    const orders = [
      order({ id: "o1", source: "web" }),
      order({ id: "o2", source: "pos" }),
      order({ id: "o3", source: "mobile" }),
    ];
    const items = [
      item({ orderId: "o1", menuItemId: "latte", quantity: 1, subtotal: 100 }),
      item({ orderId: "o2", menuItemId: "latte", quantity: 2, subtotal: 200 }),
      item({ orderId: "o3", menuItemId: "latte", quantity: 4, subtotal: 400 }),
    ];

    const { totals } = buildProductAnalytics(orders, items, {
      metric: "sales",
      sources: ["pos", "mobile"],
    });

    expect(totals[0]).toEqual(expect.objectContaining({ units: 6, sales: 600, orders: 2 }));
  });

  it("treats an empty source list as no source filter", () => {
    const orders = [order({ id: "o1", source: "web" })];
    const items = [item({ orderId: "o1", menuItemId: "latte" })];

    const { totals } = buildProductAnalytics(orders, items, { metric: "sales", sources: [] });

    expect(totals).toHaveLength(1);
  });
});

describe("buildProductAnalytics — product filters", () => {
  const orders = [order({ id: "o1" })];
  const items = [
    item({ orderId: "o1", menuItemId: "latte", menuItemName: "Iced Latte", subtotal: 100 }),
    item({ orderId: "o1", menuItemId: "cake", menuItemName: "Carrot Cake", subtotal: 200 }),
  ];

  it("matches the search term case-insensitively on the product name", () => {
    const { totals } = buildProductAnalytics(orders, items, {
      metric: "sales",
      search: "  LATTE ",
    });

    expect(totals.map((t) => t.menuItemId)).toEqual(["latte"]);
  });

  it("filters to a single menu category", () => {
    const { totals } = buildProductAnalytics(orders, items, {
      metric: "sales",
      categoryId: "desserts",
      categoryByItemId: { latte: "drinks", cake: "desserts" },
    });

    expect(totals.map((t) => t.menuItemId)).toEqual(["cake"]);
  });

  it("excludes products with no known category when a category is selected", () => {
    const { totals } = buildProductAnalytics(orders, items, {
      metric: "sales",
      categoryId: "desserts",
      categoryByItemId: { cake: "desserts" },
    });

    expect(totals.map((t) => t.menuItemId)).toEqual(["cake"]);
  });

  it("leaves day totals reflecting only the filtered products", () => {
    const { days } = buildProductAnalytics(orders, items, {
      metric: "sales",
      search: "latte",
    });

    expect(days[0].totalSales).toBe(100);
  });
});

describe("buildProductAnalytics — ranking and top-N", () => {
  const orders = [order({ id: "o1" }), order({ id: "o2" }), order({ id: "o3" })];
  const items = [
    // cheap but high volume
    item({ orderId: "o1", menuItemId: "water", menuItemName: "Water", quantity: 10, subtotal: 100 }),
    // expensive, low volume, appears in two orders
    item({ orderId: "o2", menuItemId: "steak", menuItemName: "Steak", quantity: 1, subtotal: 500 }),
    item({ orderId: "o3", menuItemId: "steak", menuItemName: "Steak", quantity: 1, subtotal: 500 }),
  ];

  it("ranks by peso sales when the metric is sales", () => {
    const { days } = buildProductAnalytics(orders, items, { metric: "sales" });
    expect(days[0].rows.map((r) => r.menuItemId)).toEqual(["steak", "water"]);
  });

  it("ranks by units sold when the metric is units", () => {
    const { days } = buildProductAnalytics(orders, items, { metric: "units" });
    expect(days[0].rows.map((r) => r.menuItemId)).toEqual(["water", "steak"]);
  });

  it("ranks by distinct order count when the metric is orders", () => {
    const { days } = buildProductAnalytics(orders, items, { metric: "orders" });
    expect(days[0].rows.map((r) => r.menuItemId)).toEqual(["steak", "water"]);
  });

  it("caps each day to topN rows without distorting that day's totals", () => {
    const { days } = buildProductAnalytics(orders, items, { metric: "sales", topN: 1 });

    expect(days[0].rows).toHaveLength(1);
    expect(days[0].rows[0].menuItemId).toBe("steak");
    expect(days[0].totalSales).toBe(1100);
    expect(days[0].truncatedCount).toBe(1);
  });

  it("reports no truncation when topN covers every product", () => {
    const { days } = buildProductAnalytics(orders, items, { metric: "sales", topN: 10 });
    expect(days[0].truncatedCount).toBe(0);
  });

  it("ranks each day independently", () => {
    const twoDayOrders = [
      order({ id: "a", createdAtMs: JUL_27_MORNING }),
      order({ id: "b", createdAtMs: JUL_28_MORNING }),
    ];
    const twoDayItems = [
      item({ orderId: "a", menuItemId: "water", menuItemName: "Water", quantity: 1, subtotal: 50 }),
      item({ orderId: "a", menuItemId: "steak", menuItemName: "Steak", quantity: 1, subtotal: 500 }),
      item({ orderId: "b", menuItemId: "water", menuItemName: "Water", quantity: 1, subtotal: 900 }),
      item({ orderId: "b", menuItemId: "steak", menuItemName: "Steak", quantity: 1, subtotal: 500 }),
    ];

    const { days } = buildProductAnalytics(twoDayOrders, twoDayItems, {
      metric: "sales",
      topN: 1,
    });

    expect(days[0].rows[0].menuItemId).toBe("water");
    expect(days[1].rows[0].menuItemId).toBe("steak");
  });

  it("breaks ties by product name so the order is stable", () => {
    const tieItems = [
      item({ orderId: "o1", menuItemId: "b", menuItemName: "Bravo", quantity: 1, subtotal: 100 }),
      item({ orderId: "o1", menuItemId: "a", menuItemName: "Alpha", quantity: 1, subtotal: 100 }),
    ];

    const { days } = buildProductAnalytics([order({ id: "o1" })], tieItems, { metric: "sales" });

    expect(days[0].rows.map((r) => r.menuItemName)).toEqual(["Alpha", "Bravo"]);
  });

  it("totals across the whole window ignore topN", () => {
    const { totals } = buildProductAnalytics(orders, items, { metric: "sales", topN: 1 });
    expect(totals.map((t) => t.menuItemId)).toEqual(["steak", "water"]);
    expect(totals[0].sales).toBe(1000);
  });
});

describe("previousWindow", () => {
  it("returns the equal-length window immediately before the current one", () => {
    const start = Date.UTC(2026, 6, 22);
    const end = Date.UTC(2026, 6, 29);

    expect(previousWindow(start, end)).toEqual({
      startMs: Date.UTC(2026, 6, 15),
      endMs: start,
    });
  });

  it("handles a single-day window", () => {
    const start = Date.UTC(2026, 6, 28);
    const end = start + DAY_MS;

    expect(previousWindow(start, end)).toEqual({ startMs: start - DAY_MS, endMs: start });
  });
});

describe("computeProductDeltas", () => {
  const current = [
    { menuItemId: "latte", menuItemName: "Latte", units: 12, orders: 10, sales: 1200 },
    { menuItemId: "cake", menuItemName: "Cake", units: 4, orders: 4, sales: 800 },
    { menuItemId: "new", menuItemName: "New Item", units: 3, orders: 3, sales: 300 },
  ];
  const previous = [
    { menuItemId: "latte", menuItemName: "Latte", units: 10, orders: 8, sales: 1000 },
    { menuItemId: "cake", menuItemName: "Cake", units: 8, orders: 8, sales: 1600 },
    { menuItemId: "gone", menuItemName: "Gone", units: 5, orders: 5, sales: 500 },
  ];

  it("reports the percentage change in sales and units for a product present in both windows", () => {
    const deltas = computeProductDeltas(current, previous);
    const latte = deltas.find((d) => d.menuItemId === "latte");

    expect(latte).toEqual(
      expect.objectContaining({
        units: 12,
        sales: 1200,
        previousSales: 1000,
        salesChangePercent: 20,
        unitsChangePercent: 20,
      })
    );
  });

  it("reports a negative change when a product declined", () => {
    const cake = computeProductDeltas(current, previous).find((d) => d.menuItemId === "cake");
    expect(cake?.salesChangePercent).toBe(-50);
  });

  it("marks a product with no previous sales as new rather than +Infinity", () => {
    const fresh = computeProductDeltas(current, previous).find((d) => d.menuItemId === "new");
    expect(fresh?.isNew).toBe(true);
    expect(fresh?.salesChangePercent).toBeUndefined();
    expect(fresh?.previousSales).toBe(0);
  });

  it("carries products that sold previously but not in the current window as a full decline", () => {
    const gone = computeProductDeltas(current, previous).find((d) => d.menuItemId === "gone");

    expect(gone).toEqual(
      expect.objectContaining({
        units: 0,
        sales: 0,
        previousSales: 500,
        salesChangePercent: -100,
        isNew: false,
      })
    );
  });

  it("preserves the ranking of the current window and appends dropped products last", () => {
    const deltas = computeProductDeltas(current, previous);
    expect(deltas.map((d) => d.menuItemId)).toEqual(["latte", "cake", "new", "gone"]);
  });

  it("rounds percentages to one decimal", () => {
    const deltas = computeProductDeltas(
      [{ menuItemId: "x", menuItemName: "X", units: 1, orders: 1, sales: 100 }],
      [{ menuItemId: "x", menuItemName: "X", units: 1, orders: 1, sales: 300 }]
    );
    expect(deltas[0].salesChangePercent).toBe(-66.7);
  });
});
