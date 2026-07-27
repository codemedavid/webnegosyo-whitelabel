/**
 * Phase 6 — the merchant app's inventory surface.
 *
 * The web admin already shows a merchant which ingredients crossed their
 * reorder level (`src/lib/inventory/stock-alerts-view.ts`). On the phone the
 * merchant is standing in the kitchen rather than at a desk, so this surface
 * shows the WHOLE shelf — healthy ingredients included — and sorts the trouble
 * to the top. Deriving the level from `inventory_items` rather than from the
 * `stock_alerts` table means the screen is useful even for a tenant who never
 * switched alerts on.
 *
 * Pure: no React, no Supabase, no colours. Same discipline as the web core, so
 * both surfaces answer "is this low?" identically.
 */

import {
  buildStockViews,
  describeStockView,
  evaluateStockLevel,
  filterStockViews,
  formatStockQuantity,
  sortStockViews,
  stockFillRatio,
  summarizeStock,
  type InventoryItemRow,
  type InventoryUnitRow,
  type StockItemView,
} from "./inventory-stock";

function item(overrides: Partial<InventoryItemRow> = {}): InventoryItemRow {
  return {
    id: "i1",
    name: "Flour",
    current_qty: 40,
    reorder_level: 20,
    is_active: true,
    stock_unit_id: "u1",
    ...overrides,
  };
}

function view(overrides: Partial<StockItemView> = {}): StockItemView {
  return {
    id: "i1",
    name: "Flour",
    quantity: 40,
    reorderLevel: 20,
    stockUnitId: "u1",
    unitAbbreviation: "kg",
    level: "ok",
    ...overrides,
  };
}

const units: InventoryUnitRow[] = [
  { id: "u1", abbreviation: "kg" },
  { id: "u2", abbreviation: "L" },
];

describe("evaluateStockLevel", () => {
  it("calls an ingredient out when nothing is left", () => {
    expect(evaluateStockLevel({ current_qty: 0, reorder_level: 20 })).toBe("out");
  });

  it("calls an ingredient out when a sale landed before its delivery", () => {
    // Negative on-hand is real: the sale is recorded, the receipt is not yet.
    expect(evaluateStockLevel({ current_qty: -3, reorder_level: 20 })).toBe("out");
  });

  it("treats NUMERIC round-trip dust as nothing left", () => {
    expect(evaluateStockLevel({ current_qty: 0.00001, reorder_level: 20 })).toBe("out");
  });

  it("calls an ingredient low once it reaches its reorder level", () => {
    expect(evaluateStockLevel({ current_qty: 20, reorder_level: 20 })).toBe("low");
  });

  it("leaves an ingredient above its reorder level alone", () => {
    expect(evaluateStockLevel({ current_qty: 20.5, reorder_level: 20 })).toBe("ok");
  });

  it("never calls an ingredient low when no reorder level was set", () => {
    // A merchant who has not chosen a threshold has not asked to be warned.
    expect(evaluateStockLevel({ current_qty: 1, reorder_level: 0 })).toBe("ok");
  });
});

describe("buildStockViews", () => {
  it("resolves each ingredient's unit abbreviation", () => {
    const [built] = buildStockViews([item({ stock_unit_id: "u2" })], units);

    expect(built.unitAbbreviation).toBe("L");
  });

  it("still shows an ingredient whose unit cannot be resolved", () => {
    // An unresolvable unit costs the suffix, not the row.
    const [built] = buildStockViews([item({ stock_unit_id: null })], units);

    expect(built.name).toBe("Flour");
    expect(built.unitAbbreviation).toBe("");
  });

  it("leaves archived ingredients off the shelf", () => {
    // An ingredient the merchant retired is not something to reorder.
    const built = buildStockViews([item({ is_active: false })], units);

    expect(built).toEqual([]);
  });

  it("stamps each row with its level", () => {
    const built = buildStockViews(
      [
        item({ id: "a", current_qty: 0 }),
        item({ id: "b", current_qty: 5 }),
        item({ id: "c", current_qty: 99 }),
      ],
      units,
    );

    expect(built.map((v) => v.level)).toEqual(["out", "low", "ok"]);
  });
});

describe("sortStockViews", () => {
  it("puts what cannot be served above what merely needs reordering", () => {
    const sorted = sortStockViews([
      view({ id: "ok", name: "Sugar", level: "ok" }),
      view({ id: "low", name: "Butter", level: "low" }),
      view({ id: "out", name: "Yeast", level: "out" }),
    ]);

    expect(sorted.map((v) => v.id)).toEqual(["out", "low", "ok"]);
  });

  it("orders alphabetically within a level so the list is scannable", () => {
    const sorted = sortStockViews([
      view({ id: "b", name: "Yeast", level: "low" }),
      view({ id: "a", name: "Butter", level: "low" }),
    ]);

    expect(sorted.map((v) => v.name)).toEqual(["Butter", "Yeast"]);
  });

  it("does not mutate the list it was given", () => {
    // The caller holds this in React state.
    const original = [view({ id: "ok", level: "ok" }), view({ id: "out", level: "out" })];

    sortStockViews(original);

    expect(original.map((v) => v.id)).toEqual(["ok", "out"]);
  });
});

describe("summarizeStock", () => {
  it("counts each level so the header can show the whole shelf at a glance", () => {
    const summary = summarizeStock([
      view({ level: "out" }),
      view({ level: "low" }),
      view({ level: "low" }),
      view({ level: "ok" }),
    ]);

    expect(summary).toMatchObject({ outCount: 1, lowCount: 2, okCount: 1, total: 4 });
  });

  it("leads the headline with outages", () => {
    const summary = summarizeStock([view({ level: "out" }), view({ level: "low" })]);

    expect(summary.headline).toBe("1 ingredient out of stock, 1 running low");
  });

  it("says so plainly when the shelf is healthy", () => {
    const summary = summarizeStock([view({ level: "ok" })]);

    expect(summary.needsAttention).toBe(0);
    expect(summary.headline).toBe("Everything is in stock");
  });

  it("does not claim health when nothing is tracked at all", () => {
    // An empty shelf is an unconfigured feature, not a well-stocked kitchen.
    const summary = summarizeStock([]);

    expect(summary.headline).toBe("No ingredients tracked yet");
  });
});

describe("filterStockViews", () => {
  const shelf = [
    view({ id: "a", name: "Bread Flour", level: "out" }),
    view({ id: "b", name: "Butter", level: "low" }),
    view({ id: "c", name: "Sugar", level: "ok" }),
  ];

  it("shows everything by default", () => {
    expect(filterStockViews(shelf, { level: "all", query: "" })).toHaveLength(3);
  });

  it("narrows to one level when the merchant taps a chip", () => {
    const filtered = filterStockViews(shelf, { level: "low", query: "" });

    expect(filtered.map((v) => v.id)).toEqual(["b"]);
  });

  it("finds an ingredient by any part of its name, whatever the casing", () => {
    const filtered = filterStockViews(shelf, { level: "all", query: "  FLOUR " });

    expect(filtered.map((v) => v.id)).toEqual(["a"]);
  });

  it("applies the search within the chosen level, not instead of it", () => {
    expect(filterStockViews(shelf, { level: "ok", query: "flour" })).toEqual([]);
  });
});

describe("formatStockQuantity", () => {
  it("trims the trailing zeros a NUMERIC round-trip leaves behind", () => {
    expect(formatStockQuantity(5.0, "kg")).toBe("5 kg");
  });

  it("keeps a real fraction", () => {
    expect(formatStockQuantity(0.75, "kg")).toBe("0.75 kg");
  });

  it("omits the space when there is no unit to show", () => {
    expect(formatStockQuantity(12, "")).toBe("12");
  });
});

describe("stockFillRatio", () => {
  it("sits exactly half full at the reorder line, so trouble reads as below halfway", () => {
    expect(stockFillRatio(view({ quantity: 20, reorderLevel: 20 }))).toBeCloseTo(0.5);
  });

  it("never renders a negative bar when stock has gone below zero", () => {
    expect(stockFillRatio(view({ quantity: -5, reorderLevel: 20 }))).toBe(0);
  });

  it("caps a well-stocked ingredient at a full bar", () => {
    expect(stockFillRatio(view({ quantity: 900, reorderLevel: 20 }))).toBe(1);
  });

  it("shows a full bar when there is stock but no threshold to measure it against", () => {
    expect(stockFillRatio(view({ quantity: 7, reorderLevel: 0 }))).toBe(1);
  });

  it("shows an empty bar when there is no stock and no threshold", () => {
    expect(stockFillRatio(view({ quantity: 0, reorderLevel: 0 }))).toBe(0);
  });
});

describe("describeStockView", () => {
  it("describes an exhausted ingredient without a quantity", () => {
    // "0 kg left" reads as a measurement; "out of stock" reads as a problem.
    expect(describeStockView(view({ name: "Yeast", level: "out", quantity: 0 }))).toBe(
      "Yeast is out of stock",
    );
  });

  it("gives a low ingredient both numbers so the merchant knows how far under it is", () => {
    expect(
      describeStockView(view({ name: "Flour", level: "low", quantity: 5, reorderLevel: 20 })),
    ).toBe("Flour is down to 5 kg (reorder at 20 kg)");
  });

  it("states plainly what a healthy ingredient has on hand", () => {
    expect(describeStockView(view({ name: "Sugar", level: "ok", quantity: 40 }))).toBe(
      "Sugar has 40 kg on hand",
    );
  });
});
