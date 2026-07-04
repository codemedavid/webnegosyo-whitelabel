import {
  formatPercent,
  classifyGrowth,
  withShares,
  buildFunnelSteps,
  describePeakHour,
  buildTrendSeries,
  type BreakdownRow,
} from "./analytics-utils";

describe("formatPercent", () => {
  it("formats a ratio-free percentage value with one decimal", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
  });

  it("drops the decimal for whole numbers", () => {
    expect(formatPercent(50)).toBe("50%");
  });

  it("treats non-finite input as zero", () => {
    expect(formatPercent(NaN)).toBe("0%");
    expect(formatPercent(Infinity)).toBe("0%");
  });
});

describe("classifyGrowth", () => {
  it("classifies positive growth as up with a signed label", () => {
    expect(classifyGrowth(8.2)).toEqual({ direction: "up", label: "+8.2%" });
  });

  it("classifies negative growth as down", () => {
    expect(classifyGrowth(-3)).toEqual({ direction: "down", label: "-3%" });
  });

  it("classifies tiny movement (<0.05%) as flat", () => {
    expect(classifyGrowth(0.02)).toEqual({ direction: "flat", label: "0%" });
  });

  it("treats undefined/non-finite growth as flat", () => {
    expect(classifyGrowth(undefined)).toEqual({ direction: "flat", label: "0%" });
    expect(classifyGrowth(NaN)).toEqual({ direction: "flat", label: "0%" });
  });
});

describe("withShares", () => {
  const rows: BreakdownRow[] = [
    { label: "Delivery", value: 600 },
    { label: "Pickup", value: 300 },
    { label: "Dine-in", value: 100 },
  ];

  it("adds a percentage share and sorts descending by value", () => {
    const result = withShares([rows[2], rows[0], rows[1]]);

    expect(result.map((r) => r.label)).toEqual([
      "Delivery",
      "Pickup",
      "Dine-in",
    ]);
    expect(result[0].share).toBe(60);
    expect(result[1].share).toBe(30);
    expect(result[2].share).toBe(10);
  });

  it("does not mutate the input array", () => {
    const input = [rows[2], rows[0]];
    const snapshot = [...input];

    withShares(input);

    expect(input).toEqual(snapshot);
  });

  it("returns zero shares when the total is zero", () => {
    const result = withShares([{ label: "A", value: 0 }]);
    expect(result[0].share).toBe(0);
  });

  it("returns an empty array for empty input", () => {
    expect(withShares([])).toEqual([]);
  });
});

describe("buildFunnelSteps", () => {
  it("computes width ratios relative to the first stage", () => {
    const steps = buildFunnelSteps([
      { label: "Shown", value: 200 },
      { label: "Clicked", value: 50 },
      { label: "Converted", value: 10 },
    ]);

    expect(steps[0]).toEqual({ label: "Shown", value: 200, ratio: 1 });
    expect(steps[1]).toEqual({ label: "Clicked", value: 50, ratio: 0.25 });
    expect(steps[2]).toEqual({ label: "Converted", value: 10, ratio: 0.05 });
  });

  it("keeps a minimum visible ratio for non-zero stages", () => {
    const steps = buildFunnelSteps([
      { label: "Shown", value: 10000 },
      { label: "Converted", value: 1 },
    ]);
    expect(steps[1].ratio).toBeGreaterThanOrEqual(0.04);
  });

  it("returns zero ratios when the first stage is zero", () => {
    const steps = buildFunnelSteps([
      { label: "Shown", value: 0 },
      { label: "Clicked", value: 0 },
    ]);
    expect(steps.every((s) => s.ratio === 0)).toBe(true);
  });
});

describe("describePeakHour", () => {
  it("renders day-of-week and 12-hour time", () => {
    expect(describePeakHour({ day: 5, hour: 19 })).toBe("Fri 7 PM");
  });

  it("handles midnight and noon correctly", () => {
    expect(describePeakHour({ day: 0, hour: 0 })).toBe("Sun 12 AM");
    expect(describePeakHour({ day: 3, hour: 12 })).toBe("Wed 12 PM");
  });

  it("returns a dash for missing data", () => {
    expect(describePeakHour(null)).toBe("—");
    expect(describePeakHour(undefined)).toBe("—");
  });
});

describe("buildTrendSeries", () => {
  const trends = [
    { date: "2026-06-29", totalOrders: 10, totalRevenue: 1500, avgOrderValue: 150 },
    { date: "2026-06-30", totalOrders: 20, totalRevenue: 4000, avgOrderValue: 200 },
    { date: "2026-07-01", totalOrders: 5, totalRevenue: 500, avgOrderValue: 100 },
  ];

  it("maps a metric into chart points with short day labels", () => {
    const series = buildTrendSeries(trends, "totalRevenue");

    expect(series).toEqual([
      { label: "6/29", value: 1500 },
      { label: "6/30", value: 4000 },
      { label: "7/1", value: 500 },
    ]);
  });

  it("supports the orders metric", () => {
    expect(buildTrendSeries(trends, "totalOrders").map((p) => p.value)).toEqual(
      [10, 20, 5],
    );
  });

  it("returns an empty series for undefined input", () => {
    expect(buildTrendSeries(undefined, "totalRevenue")).toEqual([]);
  });
});
