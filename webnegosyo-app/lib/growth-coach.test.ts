import {
  parseTargetRevenue,
  buildGrowthCoachFacts,
  type BuildFactsInput,
} from "./growth-coach";

describe("parseTargetRevenue", () => {
  it("parses a plain integer string", () => {
    expect(parseTargetRevenue("500000")).toBe(500000);
  });

  it("strips thousands separators", () => {
    expect(parseTargetRevenue("500,000")).toBe(500000);
  });

  it("strips the peso sign and surrounding whitespace", () => {
    expect(parseTargetRevenue(" ₱500,000 ")).toBe(500000);
  });

  it("expands a lowercase 'k' suffix to thousands", () => {
    expect(parseTargetRevenue("500k")).toBe(500000);
  });

  it("expands an 'm'/'M' suffix to millions, decimals included", () => {
    expect(parseTargetRevenue("1.5m")).toBe(1500000);
    expect(parseTargetRevenue("1.5M")).toBe(1500000);
  });

  it("tolerates internal spaces around the suffix", () => {
    expect(parseTargetRevenue(" 500 k ")).toBe(500000);
  });

  it("keeps a legitimate decimal amount", () => {
    expect(parseTargetRevenue("1,234.56")).toBe(1234.56);
  });

  it("returns null for empty, non-numeric, zero, or negative input", () => {
    expect(parseTargetRevenue("")).toBeNull();
    expect(parseTargetRevenue("   ")).toBeNull();
    expect(parseTargetRevenue("abc")).toBeNull();
    expect(parseTargetRevenue("0")).toBeNull();
    expect(parseTargetRevenue("-5")).toBeNull();
  });
});

const baseInput: BuildFactsInput = {
  periodDays: 30,
  targetMonthlyRevenue: 500000,
  bottleneck: "aov",
  summary: {
    totalRevenue: 250000,
    totalOrders: 1000,
    avgOrderValue: 250,
    avgOrdersPerActiveDay: 40,
    avgRevenuePerMonth: 250000,
    activeDays: 25,
  },
  scaleTarget: {
    ordersNeededPerDay: 67,
    additionalOrdersPerDay: 27,
    aovNeededAtCurrentVolume: 500,
  },
  marginPercent: 32.4,
  customers: {
    totalCustomers: 300,
    returnRate: 0.42,
    avgRevenuePerCustomer: 800,
    walkInOrders: 50,
  },
  products: [
    { name: "Latte", totalRevenue: 60000, marginPercent: 70, bcgClassification: "star" },
    { name: "Croissant", totalRevenue: 40000, marginPercent: 55 },
    { name: "Cold Brew", totalRevenue: 30000 },
  ],
  features: { bundlesEnabled: true, menuEngineeringEnabled: true },
};

describe("buildGrowthCoachFacts", () => {
  it("passes through the currency, period, target, and bottleneck", () => {
    const facts = buildGrowthCoachFacts(baseInput);
    expect(facts.currency).toBe("PHP");
    expect(facts.periodDays).toBe(30);
    expect(facts.targetMonthlyRevenue).toBe(500000);
    expect(facts.bottleneck).toBe("aov");
  });

  it("maps the actual performance block, rounding money to whole pesos", () => {
    const facts = buildGrowthCoachFacts({
      ...baseInput,
      summary: { ...baseInput.summary, totalRevenue: 250000.6, avgOrderValue: 250.4 },
    });
    expect(facts.actual.totalRevenue).toBe(250001);
    expect(facts.actual.avgOrderValue).toBe(250);
    expect(facts.actual.totalOrders).toBe(1000);
    expect(facts.actual.activeDays).toBe(25);
  });

  it("computes the monthly revenue gap and carries the scale-target numbers", () => {
    const facts = buildGrowthCoachFacts(baseInput);
    // target 500k − current run-rate 250k = 250k still to find each month.
    expect(facts.gapToTarget.monthlyRevenueGap).toBe(250000);
    expect(facts.gapToTarget.ordersNeededPerDay).toBe(67);
    expect(facts.gapToTarget.additionalOrdersPerDay).toBe(27);
    expect(facts.gapToTarget.aovNeededAtCurrentVolume).toBe(500);
  });

  it("reports a non-positive gap when the store already clears its target", () => {
    const facts = buildGrowthCoachFacts({
      ...baseInput,
      targetMonthlyRevenue: 200000,
    });
    expect(facts.gapToTarget.monthlyRevenueGap).toBe(-50000);
  });

  it("includes portfolio margin only when a margin is known", () => {
    const withMargin = buildGrowthCoachFacts(baseInput);
    expect(withMargin.margin).toEqual({ portfolioMarginPercent: 32 });

    const withoutMargin = buildGrowthCoachFacts({ ...baseInput, marginPercent: undefined });
    expect(withoutMargin.margin).toBeUndefined();
  });

  it("maps customer aggregates and converts the return rate to a percent", () => {
    const facts = buildGrowthCoachFacts(baseInput);
    expect(facts.customers).toEqual({
      total: 300,
      returnRatePercent: 42,
      avgRevenuePerCustomer: 800,
      walkInOrders: 50,
    });
  });

  it("takes the top 5 products by revenue and drops unnamed / zero-revenue rows", () => {
    const facts = buildGrowthCoachFacts({
      ...baseInput,
      products: [
        { name: "A", totalRevenue: 10 },
        { name: "B", totalRevenue: 50 },
        { name: "", totalRevenue: 999 }, // unnamed → dropped
        { name: "C", totalRevenue: 0 }, // zero revenue → dropped
        { name: "D", totalRevenue: 30 },
        { name: "E", totalRevenue: 40 },
        { name: "F", totalRevenue: 20 },
        { name: "G", totalRevenue: 5 },
      ],
    });
    expect(facts.topProducts?.map((p) => p.name)).toEqual(["B", "E", "D", "F", "A"]);
    expect(facts.topProducts).toHaveLength(5);
  });

  it("omits topProducts entirely when no usable product rows exist", () => {
    const facts = buildGrowthCoachFacts({ ...baseInput, products: [] });
    expect(facts.topProducts).toBeUndefined();
  });

  it("flags hasData=false and omits customers when there are no orders", () => {
    const facts = buildGrowthCoachFacts({
      ...baseInput,
      summary: { ...baseInput.summary, totalOrders: 0, totalRevenue: 0 },
      customers: undefined,
    });
    expect(facts.hasData).toBe(false);
    expect(facts.customers).toBeUndefined();
  });

  it("defaults feature flags to false when the features block is omitted", () => {
    const { features: _omit, ...withoutFeatures } = baseInput;
    const facts = buildGrowthCoachFacts(withoutFeatures);
    expect(facts.features).toEqual({ bundlesEnabled: false, menuEngineeringEnabled: false });
  });
});
