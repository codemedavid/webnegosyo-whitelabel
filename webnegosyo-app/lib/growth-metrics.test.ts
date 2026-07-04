import {
  computeGrowthSummary,
  bucketByWeek,
  bucketByMonth,
  diagnoseGrowth,
  computeScaleTarget,
  type DailyTrend,
} from "./growth-metrics";

const week: DailyTrend[] = [
  { date: "2026-06-29", totalOrders: 10, totalRevenue: 2000, avgOrderValue: 200 },
  { date: "2026-06-30", totalOrders: 15, totalRevenue: 3000, avgOrderValue: 200 },
  { date: "2026-07-01", totalOrders: 10, totalRevenue: 2000, avgOrderValue: 200 },
];

describe("computeGrowthSummary", () => {
  it("computes totals and per-day/week/month averages over the full period", () => {
    // 35 orders, ₱7,000 over a 7-day window (some days had no orders).
    const summary = computeGrowthSummary(week, { periodDays: 7 });

    expect(summary.totalOrders).toBe(35);
    expect(summary.totalRevenue).toBe(7000);
    expect(summary.avgOrdersPerDay).toBe(5);
    expect(summary.avgRevenuePerDay).toBe(1000);
    expect(summary.avgRevenuePerWeek).toBe(7000);
    expect(summary.avgRevenuePerMonth).toBe(30000);
  });

  it("computes AOV (the revenue:orders ratio) from totals", () => {
    const summary = computeGrowthSummary(week, { periodDays: 7 });
    expect(summary.avgOrderValue).toBe(200);
  });

  it("counts only days that actually had orders as active days", () => {
    const withQuietDay: DailyTrend[] = [
      ...week,
      { date: "2026-07-02", totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
    ];
    const summary = computeGrowthSummary(withQuietDay, { periodDays: 7 });
    expect(summary.activeDays).toBe(3);
  });

  it("computes revenue per customer when a customer count is provided", () => {
    const summary = computeGrowthSummary(week, { periodDays: 7, totalCustomers: 10 });
    expect(summary.revenuePerCustomer).toBe(700);
  });

  it("leaves revenue per customer undefined without a customer count", () => {
    const summary = computeGrowthSummary(week, { periodDays: 7 });
    expect(summary.revenuePerCustomer).toBeUndefined();
  });

  it("returns all zeros for an empty period without NaN/Infinity", () => {
    const summary = computeGrowthSummary([], { periodDays: 7 });

    expect(summary.totalOrders).toBe(0);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.avgOrdersPerDay).toBe(0);
    expect(summary.avgRevenuePerDay).toBe(0);
    expect(summary.avgOrderValue).toBe(0);
    expect(summary.activeDays).toBe(0);
    expect(Object.values(summary).every((v) => v === undefined || Number.isFinite(v as number))).toBe(true);
  });

  it("guards against a zero or negative period", () => {
    const summary = computeGrowthSummary(week, { periodDays: 0 });
    expect(summary.avgOrdersPerDay).toBe(0);
    expect(summary.avgRevenuePerDay).toBe(0);
  });
});

describe("bucketByWeek", () => {
  it("groups days into Monday-start weeks and sums revenue and orders", () => {
    const days: DailyTrend[] = [
      // Week of Mon 2026-06-22
      { date: "2026-06-25", totalOrders: 5, totalRevenue: 1000, avgOrderValue: 200 },
      { date: "2026-06-27", totalOrders: 5, totalRevenue: 1500, avgOrderValue: 300 },
      // Week of Mon 2026-06-29
      { date: "2026-06-29", totalOrders: 10, totalRevenue: 2000, avgOrderValue: 200 },
      { date: "2026-07-01", totalOrders: 10, totalRevenue: 3000, avgOrderValue: 300 },
    ];

    const weeks = bucketByWeek(days);

    expect(weeks).toEqual([
      { label: "6/22", revenue: 2500, orders: 10 },
      { label: "6/29", revenue: 5000, orders: 20 },
    ]);
  });

  it("handles a Sunday by assigning it to the previous Monday's week", () => {
    // 2026-06-28 is a Sunday → belongs to the week of Mon 2026-06-22.
    const weeks = bucketByWeek([
      { date: "2026-06-28", totalOrders: 2, totalRevenue: 400, avgOrderValue: 200 },
    ]);
    expect(weeks).toEqual([{ label: "6/22", revenue: 400, orders: 2 }]);
  });

  it("returns an empty array for empty or undefined input", () => {
    expect(bucketByWeek([])).toEqual([]);
    expect(bucketByWeek(undefined)).toEqual([]);
  });
});

describe("bucketByMonth", () => {
  it("groups days into calendar months in chronological order", () => {
    const days: DailyTrend[] = [
      { date: "2026-06-30", totalOrders: 10, totalRevenue: 2000, avgOrderValue: 200 },
      { date: "2026-07-01", totalOrders: 5, totalRevenue: 1500, avgOrderValue: 300 },
      { date: "2026-07-02", totalOrders: 5, totalRevenue: 500, avgOrderValue: 100 },
    ];

    const months = bucketByMonth(days);

    expect(months).toEqual([
      { label: "Jun", revenue: 2000, orders: 10 },
      { label: "Jul", revenue: 2000, orders: 10 },
    ]);
  });

  it("returns an empty array for empty or undefined input", () => {
    expect(bucketByMonth([])).toEqual([]);
    expect(bucketByMonth(undefined)).toEqual([]);
  });
});

describe("diagnoseGrowth", () => {
  const benchmarks = { minOrdersPerDay: 10, minAov: 150, minMarginPercent: 25 };

  it("flags no-data when there are no orders at all", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 0, avgOrderValue: 0, totalOrders: 0 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("no-data");
  });

  it("flags a customer bottleneck when daily order volume is low", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 4, avgOrderValue: 300, totalOrders: 28 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("customers");
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.advice.length).toBeGreaterThan(0);
  });

  it("flags low buying power when volume is fine but AOV is low", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 20, avgOrderValue: 100, totalOrders: 140 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("aov");
  });

  it("flags a margin bottleneck when volume and AOV are fine but margin is thin", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 20, avgOrderValue: 300, totalOrders: 140, marginPercent: 12 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("margin");
  });

  it("reports healthy when every lever clears its benchmark", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 20, avgOrderValue: 300, totalOrders: 140, marginPercent: 60 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("healthy");
  });

  it("skips the margin check when margin data is unavailable", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 20, avgOrderValue: 300, totalOrders: 140 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("healthy");
  });

  it("prioritizes customers over AOV when both are low", () => {
    const result = diagnoseGrowth(
      { avgOrdersPerDay: 2, avgOrderValue: 50, totalOrders: 14 },
      benchmarks,
    );
    expect(result.bottleneck).toBe("customers");
  });

  it("uses built-in benchmarks when none are provided", () => {
    const result = diagnoseGrowth({ avgOrdersPerDay: 1, avgOrderValue: 500, totalOrders: 7 });
    expect(result.bottleneck).toBe("customers");
  });
});

describe("computeScaleTarget", () => {
  it("computes orders needed per month and per day for a revenue target", () => {
    const target = computeScaleTarget({
      targetMonthlyRevenue: 60000,
      avgOrderValue: 200,
      avgOrdersPerDay: 6,
    });

    expect(target.ordersNeededPerMonth).toBe(300);
    expect(target.ordersNeededPerDay).toBe(10);
    expect(target.additionalOrdersPerDay).toBe(4);
  });

  it("computes the AOV needed at the current order volume", () => {
    const target = computeScaleTarget({
      targetMonthlyRevenue: 60000,
      avgOrderValue: 200,
      avgOrdersPerDay: 6,
    });
    // 60,000 ÷ (6 orders/day × 30 days) = ₱333.33…
    expect(target.aovNeededAtCurrentVolume).toBeCloseTo(333.33, 1);
  });

  it("clamps additional orders to zero when already above target", () => {
    const target = computeScaleTarget({
      targetMonthlyRevenue: 30000,
      avgOrderValue: 200,
      avgOrdersPerDay: 20,
    });
    expect(target.additionalOrdersPerDay).toBe(0);
  });

  it("guards division by zero when AOV or volume is zero", () => {
    const target = computeScaleTarget({
      targetMonthlyRevenue: 60000,
      avgOrderValue: 0,
      avgOrdersPerDay: 0,
    });

    expect(target.ordersNeededPerMonth).toBe(0);
    expect(target.ordersNeededPerDay).toBe(0);
    expect(target.additionalOrdersPerDay).toBe(0);
    expect(target.aovNeededAtCurrentVolume).toBe(0);
  });
});
