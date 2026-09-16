import {
  computeProfitSummary,
  rankByVelocity,
  rankByMargin,
  computeRevenueConcentration,
  type ProductRow,
} from "./profit-analytics";

// Small fixture: A/B are costed, C sells but has no cost, D never sold.
const mixed: ProductRow[] = [
  {
    menuItemId: "a",
    menuItemName: "Latte",
    totalUnitsSold: 20,
    totalRevenue: 1000,
    marginPercent: 40, // no explicit cost → derive: cost 600, profit 400
    avgDailyUnits: 2,
  },
  {
    menuItemId: "b",
    menuItemName: "Cold Brew",
    totalUnitsSold: 10,
    totalRevenue: 500,
    totalCost: 200, // explicit cost/profit take precedence
    totalProfit: 300,
    marginPercent: 60,
    avgDailyUnits: 5,
  },
  {
    menuItemId: "c",
    menuItemName: "Muffin",
    totalUnitsSold: 5,
    totalRevenue: 300,
    avgDailyUnits: 1, // sells, but no cost entered
  },
  {
    menuItemId: "d",
    menuItemName: "New Item",
    totalUnitsSold: 0,
    totalRevenue: 0,
    avgDailyUnits: 0, // never sold, no cost
  },
];

describe("computeProfitSummary", () => {
  it("sums cost and profit over costed rows and weights the margin by revenue", () => {
    const summary = computeProfitSummary(mixed);

    // Costed revenue = 1000 + 500 = 1500; cost = 600 + 200 = 800; profit = 700.
    expect(summary.costedRevenue).toBe(1500);
    expect(summary.totalCost).toBe(800);
    expect(summary.totalProfit).toBe(700);
    // 700 / 1500 = 46.6667 → 46.7
    expect(summary.weightedMarginPercent).toBe(46.7);
  });

  it("reports the full revenue across every row, costed or not", () => {
    const summary = computeProfitSummary(mixed);
    expect(summary.totalRevenue).toBe(1800); // 1000 + 500 + 300 + 0
  });

  it("counts items with and without cost, ignoring rows that never sold", () => {
    const summary = computeProfitSummary(mixed);
    expect(summary.itemsWithCost).toBe(2); // A, B
    expect(summary.itemsMissingCost).toBe(1); // C sells but has no cost; D ignored
  });

  it("derives cost from marginPercent when no explicit cost is stored", () => {
    const summary = computeProfitSummary([
      { menuItemId: "a", totalUnitsSold: 1, totalRevenue: 1000, marginPercent: 25, avgDailyUnits: 1 },
    ]);
    // cost = 1000 * (1 - 0.25) = 750; profit = 250
    expect(summary.totalCost).toBe(750);
    expect(summary.totalProfit).toBe(250);
    expect(summary.weightedMarginPercent).toBe(25);
  });

  it("returns undefined weighted margin and zero profit when nothing is costed", () => {
    const summary = computeProfitSummary([
      { menuItemId: "c", totalUnitsSold: 5, totalRevenue: 300, avgDailyUnits: 1 },
    ]);
    expect(summary.weightedMarginPercent).toBeUndefined();
    expect(summary.totalProfit).toBe(0);
    expect(summary.itemsMissingCost).toBe(1);
  });

  it("is safe on empty input", () => {
    const summary = computeProfitSummary([]);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.totalProfit).toBe(0);
    expect(summary.weightedMarginPercent).toBeUndefined();
    expect(summary.itemsWithCost).toBe(0);
    expect(summary.itemsMissingCost).toBe(0);
  });
});

describe("rankByVelocity", () => {
  it("sorts by average daily units descending and drops items with no sales", () => {
    const ranked = rankByVelocity(mixed);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["b", "a", "c"]); // 5, 2, 1; d dropped
  });

  it("respects the limit", () => {
    const ranked = rankByVelocity(mixed, 2);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const before = mixed.map((r) => r.menuItemId);
    rankByVelocity(mixed);
    expect(mixed.map((r) => r.menuItemId)).toEqual(before);
  });

  it("is safe on empty input", () => {
    expect(rankByVelocity([])).toEqual([]);
  });
});

describe("rankByMargin", () => {
  it("keeps only costed rows and sorts by margin percent descending", () => {
    const ranked = rankByMargin(mixed);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["b", "a"]); // 60, 40; c/d have no margin
  });

  it("respects the limit", () => {
    const ranked = rankByMargin(mixed, 1);
    expect(ranked.map((r) => r.menuItemId)).toEqual(["b"]);
  });

  it("is safe on empty input", () => {
    expect(rankByMargin([])).toEqual([]);
  });
});

describe("computeRevenueConcentration", () => {
  // 8 items, total ₱10,000. Shares 40/20/12/10/8/5/3/2 → cumulative 40/60/72/82/90/95/98/100.
  const pareto: ProductRow[] = [
    { menuItemId: "a", menuItemName: "A", totalUnitsSold: 1, totalRevenue: 4000, avgDailyUnits: 1 },
    { menuItemId: "b", menuItemName: "B", totalUnitsSold: 1, totalRevenue: 2000, avgDailyUnits: 1 },
    { menuItemId: "c", menuItemName: "C", totalUnitsSold: 1, totalRevenue: 1200, avgDailyUnits: 1 },
    { menuItemId: "d", menuItemName: "D", totalUnitsSold: 1, totalRevenue: 1000, avgDailyUnits: 1 },
    { menuItemId: "e", menuItemName: "E", totalUnitsSold: 1, totalRevenue: 800, avgDailyUnits: 1 },
    { menuItemId: "f", menuItemName: "F", totalUnitsSold: 1, totalRevenue: 500, avgDailyUnits: 1 },
    { menuItemId: "g", menuItemName: "G", totalUnitsSold: 1, totalRevenue: 300, avgDailyUnits: 1 },
    { menuItemId: "h", menuItemName: "H", totalUnitsSold: 1, totalRevenue: 200, avgDailyUnits: 1 },
  ];

  it("orders items by revenue and attaches per-item and cumulative shares", () => {
    const result = computeRevenueConcentration(pareto);
    expect(result.totalRevenue).toBe(10000);
    expect(result.items[0]).toMatchObject({
      menuItemId: "a",
      revenueShare: 40,
      cumulativeShare: 40,
    });
    expect(result.items[1].cumulativeShare).toBe(60);
    expect(result.items[2].cumulativeShare).toBe(72);
  });

  it("summarizes the top-N concentration (default 5)", () => {
    const result = computeRevenueConcentration(pareto);
    expect(result.topN).toBe(5);
    expect(result.topNShare).toBe(90); // cumulative of top 5
    expect(result.headline).toBe("Top 5 items drive 90% of revenue");
  });

  it("finds the fewest items that reach the Pareto threshold (default 80%)", () => {
    const result = computeRevenueConcentration(pareto);
    expect(result.paretoThreshold).toBe(80);
    expect(result.itemsForThreshold).toBe(4); // cumulative first reaches ≥80 at item #4 (82%)
  });

  it("honors custom topN and threshold options", () => {
    const result = computeRevenueConcentration(pareto, { topN: 3, paretoThreshold: 70 });
    expect(result.topNShare).toBe(72);
    expect(result.headline).toBe("Top 3 items drive 72% of revenue");
    expect(result.itemsForThreshold).toBe(3); // reaches ≥70 at item #3 (72%)
  });

  it("caps the headline count at the number of items available", () => {
    const result = computeRevenueConcentration(pareto.slice(0, 2)); // only 2 items
    expect(result.headline).toBe("Top 2 items drive 100% of revenue");
  });

  it("excludes zero-revenue rows from the ranking", () => {
    const result = computeRevenueConcentration([
      { menuItemId: "a", totalUnitsSold: 1, totalRevenue: 100, avgDailyUnits: 1 },
      { menuItemId: "z", totalUnitsSold: 0, totalRevenue: 0, avgDailyUnits: 0 },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].menuItemId).toBe("a");
  });

  it("degrades gracefully with no sales", () => {
    const result = computeRevenueConcentration([]);
    expect(result.items).toEqual([]);
    expect(result.totalRevenue).toBe(0);
    expect(result.topNShare).toBe(0);
    expect(result.itemsForThreshold).toBe(0);
    expect(result.headline).toBe("Not enough sales data yet");
  });
});
