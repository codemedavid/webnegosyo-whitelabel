/**
 * The numbers above the shelf: what the stock is worth, how healthy it is,
 * and how it splits into the merchant's own categories.
 */

import {
  UNCATEGORIZED,
  categoryChips,
  filterByCategory,
  healthSegments,
  stockValue,
  valueOf,
} from "./inventory-insights";
import type { StockItemView } from "./inventory-stock";

function view(overrides: Partial<StockItemView> = {}): StockItemView {
  return {
    id: "i1",
    name: "Flour",
    quantity: 10,
    reorderLevel: 5,
    stockUnitId: "kg",
    unitAbbreviation: "kg",
    level: "ok",
    category: "Dry goods",
    unitCost: 50,
    isPrep: false,
    ...overrides,
  };
}

describe("valueOf", () => {
  it("is quantity times unit cost", () => {
    expect(valueOf(view({ quantity: 4, unitCost: 12.5 }))).toBe(50);
  });

  it("never counts negative stock as a debt", () => {
    // Negative stock is a sale recorded before its delivery — a gap in the
    // paperwork, not money owed.
    expect(valueOf(view({ quantity: -6, unitCost: 10 }))).toBe(0);
  });

  it("is zero when no cost is known", () => {
    expect(valueOf(view({ unitCost: undefined }))).toBe(0);
  });
});

describe("stockValue", () => {
  it("sums the shelf and says how many items have no cost", () => {
    const result = stockValue([
      view({ id: "a", quantity: 2, unitCost: 100 }),
      view({ id: "b", quantity: 3, unitCost: 10 }),
      view({ id: "c", quantity: 5, unitCost: 0 }),
    ]);
    expect(result).toEqual({ total: 230, uncostedCount: 1 });
  });

  it("does not call an empty ingredient uncosted", () => {
    // Nothing on the shelf has no value to be missing.
    expect(stockValue([view({ quantity: 0, unitCost: 0 })]).uncostedCount).toBe(0);
  });
});

describe("healthSegments", () => {
  it("returns out, low, ok fractions that sum to one", () => {
    const segments = healthSegments({ outCount: 1, lowCount: 1, okCount: 2, total: 4 });
    expect(segments).toEqual([
      { level: "out", fraction: 0.25 },
      { level: "low", fraction: 0.25 },
      { level: "ok", fraction: 0.5 },
    ]);
  });

  it("drops empty segments so the ring draws no zero-length caps", () => {
    const segments = healthSegments({ outCount: 0, lowCount: 0, okCount: 3, total: 3 });
    expect(segments).toEqual([{ level: "ok", fraction: 1 }]);
  });

  it("is empty for an empty shelf", () => {
    expect(healthSegments({ outCount: 0, lowCount: 0, okCount: 0, total: 0 })).toEqual([]);
  });
});

describe("categoryChips", () => {
  it("lists each category once with its count, alphabetically, uncategorised last", () => {
    const chips = categoryChips([
      view({ id: "a", category: "Dairy" }),
      view({ id: "b", category: null }),
      view({ id: "c", category: "Dairy" }),
      view({ id: "d", category: "Produce" }),
    ]);
    expect(chips).toEqual([
      { key: "Dairy", label: "Dairy", count: 2 },
      { key: "Produce", label: "Produce", count: 1 },
      { key: UNCATEGORIZED, label: "Other", count: 1 },
    ]);
  });

  it("returns nothing when every ingredient shares one category", () => {
    // A single chip filters nothing — it is noise.
    expect(categoryChips([view({ id: "a" }), view({ id: "b" })])).toEqual([]);
  });
});

describe("filterByCategory", () => {
  const shelf = [
    view({ id: "a", category: "Dairy" }),
    view({ id: "b", category: null }),
    view({ id: "c", category: "  " }),
  ];

  it("passes everything through with no category chosen", () => {
    expect(filterByCategory(shelf, null)).toHaveLength(3);
  });

  it("narrows to one category", () => {
    expect(filterByCategory(shelf, "Dairy").map((v) => v.id)).toEqual(["a"]);
  });

  it("groups blank and missing categories under Other", () => {
    expect(filterByCategory(shelf, UNCATEGORIZED).map((v) => v.id)).toEqual(["b", "c"]);
  });
});
