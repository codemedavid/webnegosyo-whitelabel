import { BAND_LABELS, COST_GUIDES, costBand, costExplanation, costTiles, isFoodCostReliable } from "./profit-bands";
import { reportWith } from "./profit-fixtures";

describe("cost bands — guides for most restaurants, never verdicts", () => {
  it("reads food cost as usual up to 35% (the range it explains), on the high side above, high above 45%", () => {
    expect(costBand("food", 0.2)).toBe("usual");
    expect(costBand("food", 0.33)).toBe("usual");
    expect(costBand("food", 0.35)).toBe("usual");
    expect(costBand("food", 0.36)).toBe("high_side");
    expect(costBand("food", 0.38)).toBe("high_side");
    expect(costBand("food", 0.45)).toBe("high_side");
    expect(costBand("food", 0.46)).toBe("high");
  });

  it("reads staff as usual to 35%, on the high side above, high above 45%", () => {
    expect(costBand("staff", 0.35)).toBe("usual");
    expect(costBand("staff", 0.36)).toBe("high_side");
    expect(costBand("staff", 0.46)).toBe("high");
  });

  it("reads rent as usual to 10%, on the high side above, high above 15%", () => {
    expect(costBand("rent", 0.1)).toBe("usual");
    expect(costBand("rent", 0.11)).toBe("high_side");
    expect(costBand("rent", 0.15)).toBe("high_side");
    expect(costBand("rent", 0.16)).toBe("high");
  });

  it("judges the percent the tile shows, so 35.4% (shown 35%) is not called high", () => {
    expect(costBand("food", 0.354)).toBe("usual");
    expect(costBand("food", 0.355)).toBe("high_side");
  });

  it("calls Usual exactly what its explanation says most restaurants see", () => {
    for (const kind of ["food", "staff", "rent"] as const) {
      const { usualHigh, highAbove } = COST_GUIDES[kind];
      const text = costExplanation(kind, reportWith()).paragraphs.join(" ");
      expect(costBand(kind, usualHigh / 100)).toBe("usual");
      expect(costBand(kind, (usualHigh + 1) / 100)).toBe("high_side");
      expect(text).toContain(`Above ${usualHigh}% is on the high side; above ${highAbove}% is high.`);
    }
  });

  it("says nothing it cannot know", () => {
    expect(costBand("food", null)).toBe("unknown");
    expect(costBand("staff", Number.NaN)).toBe("unknown");
    expect(costBand("food", -0.05)).toBe("unknown");
  });

  it("documents the usual food range it explains", () => {
    expect(COST_GUIDES.food).toMatchObject({ usualLow: 28, usualHigh: 35 });
    expect(BAND_LABELS).toEqual({
      usual: "Usual",
      high_side: "On the high side",
      high: "High",
      unknown: "Not enough data",
      none: "None recorded",
    });
  });
});

describe("the three tiles", () => {
  it("reads food, staff and rent from the report's ratios", () => {
    // ₱40,600 / ₱26,160 / ₱19,940 of ₱124,600.
    const tiles = costTiles(reportWith());
    expect(tiles.map((tile) => [tile.kind, tile.label, tile.valueText, tile.band])).toEqual([
      ["food", "Food cost", "33%", "usual"],
      ["staff", "Staff", "21%", "usual"],
      ["rent", "Rent", "16%", "high"],
    ]);
  });

  it("has nothing to say without sales", () => {
    const tiles = costTiles(reportWith({ net_sales_cents: 0, collected_cents: 0 }));
    expect(tiles.map((tile) => [tile.valueText, tile.band])).toEqual([
      ["—", "unknown"],
      ["—", "unknown"],
      ["—", "unknown"],
    ]);
  });

  it("says none recorded instead of calling 0% staff or rent usual", () => {
    const tiles = costTiles(reportWith({ staff_cents: 0, occupancy_cents: 0 }, []));
    expect(tiles[1].band).toBe("none");
    expect(tiles[2].band).toBe("none");
  });

  it("only bands food cost from recipes when most dishes sold had a cost", () => {
    const tracked = { sale_movements: 3, ledger_cogs_cents: 4_000_000, sold_quantity: 100, sold_dishes: 10 };
    const covered = reportWith({ ...tracked, costed_quantity: 95, costed_dishes: 9 });
    const thin = reportWith({ ...tracked, costed_quantity: 60, costed_dishes: 6 });
    const hidden = reportWith({ ...tracked, costed_quantity: 95, dish_costs_visible: false });
    expect(isFoodCostReliable(covered)).toBe(true);
    expect(isFoodCostReliable(thin)).toBe(false);
    expect(isFoodCostReliable(hidden)).toBe(false);
    expect(costTiles(thin)[0].band).toBe("unknown");
    // The figure is still shown; only the guide is held back.
    expect(costTiles(thin)[0].valueText).not.toBe("—");
  });

  it("takes a purchases-based food cost as an estimate it may band", () => {
    expect(isFoodCostReliable(reportWith())).toBe(true);
  });
});

describe("the tile explanations", () => {
  it("explains food cost in plain words with the store's own figures", () => {
    const text = costExplanation("food", reportWith()).paragraphs.join(" ");
    expect(text).toContain("₱40,600 of ₱124,600");
    expect(text).toContain("28–35%");
    expect(text).toContain("most restaurants");
  });

  it("asks for the missing record when nothing was recorded", () => {
    const text = costExplanation("staff", reportWith({ staff_cents: 0 }, [])).paragraphs.join(" ");
    expect(text).toMatch(/No staff costs recorded/);
  });

  it("says why food cost has no guide when recipes are missing", () => {
    const report = reportWith({ sale_movements: 3, sold_quantity: 100, costed_quantity: 50, sold_dishes: 10, costed_dishes: 5 });
    expect(costExplanation("food", report).paragraphs.join(" ")).toMatch(/5 dishes/);
  });
});
