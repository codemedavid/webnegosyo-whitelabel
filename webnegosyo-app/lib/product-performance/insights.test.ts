import { buildProductInsights, formatOneIn } from "./insights";
import type { ProductPerformance } from "./aggregate";

function product(overrides: Partial<ProductPerformance>): ProductPerformance {
  return {
    menuItemId: "latte",
    name: "Latte",
    imageUrl: null,
    units: 100,
    sales: 15000,
    orders: 80,
    avgPrice: 150,
    previousSales: null,
    salesChange: null,
    addonRevenue: 0,
    addonRevenueIsEstimate: false,
    daily: [],
    variationGroups: [],
    addons: [],
    ...overrides,
  };
}

describe("formatOneIn", () => {
  it("turns a rate into the '1 in N' a person says out loud", () => {
    expect(formatOneIn(0.33)).toBe("1 in 3");
    expect(formatOneIn(0.25)).toBe("1 in 4");
    expect(formatOneIn(0.11)).toBe("1 in 9");
  });
});

describe("buildProductInsights", () => {
  it("leads with the trend when there is one", () => {
    const [first] = buildProductInsights(product({ salesChange: 0.18 }));

    expect(first).toEqual({ tone: "up", text: "Sales are up 18% on the period before." });
  });

  it("says plainly when sales fell", () => {
    const [first] = buildProductInsights(product({ salesChange: -0.07 }));

    expect(first).toEqual({ tone: "down", text: "Sales are down 7% on the period before." });
  });

  it("names the favourite variation when one clearly leads", () => {
    const insights = buildProductInsights(
      product({
        variationGroups: [
          {
            groupName: "Size",
            unchosenUnits: 0,
            options: [
              { name: "Large", units: 62, sales: 9900, orders: 50, share: 0.62 },
              { name: "Regular", units: 38, sales: 5100, orders: 30, share: 0.38 },
            ],
          },
        ],
      })
    );

    expect(insights).toContainEqual({ tone: "neutral", text: "Most people pick Large — 62% of Latte sold." });
  });

  it("says nothing about a group with only one option", () => {
    const insights = buildProductInsights(
      product({
        variationGroups: [
          { groupName: "Size", unchosenUnits: 0, options: [{ name: "Solo", units: 100, sales: 15000, orders: 80, share: 1 }] },
        ],
      })
    );

    expect(insights.some((i) => i.text.startsWith("Most people pick"))).toBe(false);
  });

  it("puts the most-added add-on in human terms", () => {
    const insights = buildProductInsights(
      product({
        addons: [
          { name: "Extra Shot", groupName: "Add-ons", units: 30, attachedUnits: 25, attachRate: 0.25, revenue: 900, revenueIsEstimate: false },
        ],
      })
    );

    expect(insights).toContainEqual({ tone: "tip", text: "1 in 4 add Extra Shot." });
  });

  it("says how much add-ons brought in, marking an estimate", () => {
    const insights = buildProductInsights(product({ addonRevenue: 1500, addonRevenueIsEstimate: true }));

    expect(insights).toContainEqual({ tone: "neutral", text: "Add-ons brought in about ₱1,500 — 10% of this item's sales." });
  });

  it("stays quiet for a product with nothing to say", () => {
    expect(buildProductInsights(product({ units: 0, sales: 0, orders: 0 }))).toEqual([]);
  });

  it("never offers more than three", () => {
    const insights = buildProductInsights(
      product({
        salesChange: 0.5,
        addonRevenue: 3000,
        variationGroups: [
          {
            groupName: "Size",
            unchosenUnits: 0,
            options: [
              { name: "Large", units: 70, sales: 11000, orders: 60, share: 0.7 },
              { name: "Regular", units: 30, sales: 4000, orders: 20, share: 0.3 },
            ],
          },
        ],
        addons: [
          { name: "Extra Shot", groupName: "Add-ons", units: 30, attachedUnits: 30, attachRate: 0.3, revenue: 900, revenueIsEstimate: false },
        ],
      })
    );

    expect(insights).toHaveLength(3);
  });
});
