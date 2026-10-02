/**
 * Creating and editing an ingredient from the phone.
 *
 * The web admin validates with `ingredientInputSchema`
 * (src/lib/inventory/schemas.ts). The app writes the same row straight through
 * RLS, so these rules restate that schema — a row the phone accepts and the web
 * editor would refuse is a row the web editor can no longer save.
 */

import {
  DEFAULT_UNITS,
  EMPTY_INGREDIENT_DRAFT,
  buildDefaultUnitInserts,
  buildIngredientPayload,
  canChangeStockUnit,
  draftFromIngredient,
  findNameClash,
  groupUnitsByDimension,
  parseOpeningStock,
  suggestCategories,
  type IngredientDraft,
  type IngredientRecord,
  type UnitOption,
} from "./ingredient-form";

const UNITS: UnitOption[] = [
  { id: "g", name: "Gram", abbreviation: "g", dimension: "weight", toBaseFactor: 1 },
  { id: "kg", name: "Kilogram", abbreviation: "kg", dimension: "weight", toBaseFactor: 1000 },
  { id: "ml", name: "Millilitre", abbreviation: "ml", dimension: "volume", toBaseFactor: 1 },
  { id: "pc", name: "Piece", abbreviation: "pc", dimension: "count", toBaseFactor: 1 },
];

function draft(overrides: Partial<IngredientDraft> = {}): IngredientDraft {
  return {
    ...EMPTY_INGREDIENT_DRAFT,
    name: "Flour",
    stockUnitId: "kg",
    ...overrides,
  };
}

function record(overrides: Partial<IngredientRecord> = {}): IngredientRecord {
  return {
    id: "i1",
    name: "Flour",
    sku: null,
    category: "Dry goods",
    stock_unit_id: "kg",
    unit_cost: 52.5,
    reorder_level: 5,
    is_prep: false,
    is_active: true,
    current_qty: 12,
    ...overrides,
  };
}

describe("buildIngredientPayload", () => {
  it("returns the columns the web schema accepts, trimmed", () => {
    const payload = buildIngredientPayload(
      draft({ name: "  Bread flour ", category: " Dry goods ", unitCost: "52.50", reorderLevel: "5" }),
    );

    expect(payload).toEqual({
      name: "Bread flour",
      sku: null,
      category: "Dry goods",
      stock_unit_id: "kg",
      unit_cost: 52.5,
      reorder_level: 5,
      is_prep: false,
      is_active: true,
    });
  });

  it("stores a blank category or SKU as null rather than an empty string", () => {
    // "" and null both mean "none", but only one of them groups with the
    // ingredients that never had a category.
    const payload = buildIngredientPayload(draft({ category: "   ", sku: "" }));
    expect(payload.category).toBeNull();
    expect(payload.sku).toBeNull();
  });

  it("treats a blank cost or reorder level as zero, the web default", () => {
    const payload = buildIngredientPayload(draft({ unitCost: "", reorderLevel: " " }));
    expect(payload.unit_cost).toBe(0);
    expect(payload.reorder_level).toBe(0);
  });

  it("accepts a peso sign and thousands separators in the cost", () => {
    // What a merchant types when copying off a supplier's receipt.
    expect(buildIngredientPayload(draft({ unitCost: "₱1,250.00" })).unit_cost).toBe(1250);
  });

  it("refuses a missing name", () => {
    expect(() => buildIngredientPayload(draft({ name: "  " }))).toThrow("Give the ingredient a name");
  });

  it("refuses a missing unit", () => {
    expect(() => buildIngredientPayload(draft({ stockUnitId: null }))).toThrow(
      "Choose the unit you stock it in",
    );
  });

  it("refuses a negative or non-numeric cost", () => {
    expect(() => buildIngredientPayload(draft({ unitCost: "-1" }))).toThrow("cost");
    expect(() => buildIngredientPayload(draft({ unitCost: "abc" }))).toThrow("cost");
  });

  it("refuses a negative or non-numeric reorder level", () => {
    expect(() => buildIngredientPayload(draft({ reorderLevel: "-2" }))).toThrow("reorder");
    expect(() => buildIngredientPayload(draft({ reorderLevel: "lots" }))).toThrow("reorder");
  });

  it("carries the prep flag and archived state through", () => {
    const payload = buildIngredientPayload(draft({ isPrep: true, isActive: false }));
    expect(payload.is_prep).toBe(true);
    expect(payload.is_active).toBe(false);
  });
});

describe("draftFromIngredient", () => {
  it("round-trips through the payload unchanged", () => {
    const row = record();
    const payload = buildIngredientPayload(draftFromIngredient(row));
    expect(payload).toEqual({
      name: row.name,
      sku: row.sku,
      category: row.category,
      stock_unit_id: row.stock_unit_id,
      unit_cost: row.unit_cost,
      reorder_level: row.reorder_level,
      is_prep: row.is_prep,
      is_active: row.is_active,
    });
  });

  it("shows zero cost and zero reorder as blanks, so the placeholder explains them", () => {
    const result = draftFromIngredient(record({ unit_cost: 0, reorder_level: 0 }));
    expect(result.unitCost).toBe("");
    expect(result.reorderLevel).toBe("");
  });

  it("trims NUMERIC round-trip zeros", () => {
    expect(draftFromIngredient(record({ unit_cost: 52.5 })).unitCost).toBe("52.5");
  });
});

describe("canChangeStockUnit", () => {
  it("allows any unit on a new ingredient", () => {
    expect(canChangeStockUnit(null)).toBe(true);
  });

  it("allows a change while nothing is on hand", () => {
    expect(canChangeStockUnit(record({ current_qty: 0 }))).toBe(true);
  });

  it("locks the unit while there is stock, which the change would silently re-read", () => {
    // 12 kg of flour becomes 12 g the moment the unit flips — no movement, no
    // ledger row, just a different shelf.
    expect(canChangeStockUnit(record({ current_qty: 12 }))).toBe(false);
    expect(canChangeStockUnit(record({ current_qty: -3 }))).toBe(false);
  });
});

describe("parseOpeningStock", () => {
  it("is absent when left blank", () => {
    expect(parseOpeningStock("")).toBeNull();
    expect(parseOpeningStock("  ")).toBeNull();
  });

  it("is absent at zero — a new ingredient already starts at zero", () => {
    expect(parseOpeningStock("0")).toBeNull();
  });

  it("reads a positive amount", () => {
    expect(parseOpeningStock("12.5")).toBe(12.5);
  });

  it("refuses anything that is not a positive number", () => {
    expect(() => parseOpeningStock("-4")).toThrow("opening stock");
    expect(() => parseOpeningStock("x")).toThrow("opening stock");
  });
});

describe("suggestCategories", () => {
  it("lists the categories already in use, deduped case-insensitively and sorted", () => {
    const result = suggestCategories([
      { category: "Dairy" },
      { category: "dry goods" },
      { category: "Dry goods" },
      { category: null },
      { category: "  " },
    ]);
    expect(result).toEqual(["Dairy", "dry goods"]);
  });

  it("offers starter categories to a store that has none yet", () => {
    const result = suggestCategories([]);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Produce");
  });
});

describe("groupUnitsByDimension", () => {
  it("groups by weight, volume, count in that order, smallest unit first", () => {
    const groups = groupUnitsByDimension([UNITS[1], UNITS[3], UNITS[0], UNITS[2]]);
    expect(groups.map((g) => g.dimension)).toEqual(["weight", "volume", "count"]);
    expect(groups[0].units.map((u) => u.id)).toEqual(["g", "kg"]);
  });

  it("omits a dimension with no units", () => {
    const groups = groupUnitsByDimension([UNITS[0]]);
    expect(groups.map((g) => g.dimension)).toEqual(["weight"]);
  });
});

describe("default units", () => {
  it("mirrors the web's starter catalog with one base unit per dimension", () => {
    const bases = DEFAULT_UNITS.filter((u) => u.is_base).map((u) => u.dimension);
    expect(bases.sort()).toEqual(["count", "volume", "weight"]);
    expect(DEFAULT_UNITS.map((u) => u.abbreviation)).toEqual(
      expect.arrayContaining(["g", "kg", "ml", "L", "pc"]),
    );
  });

  it("stamps every insert with the tenant", () => {
    const inserts = buildDefaultUnitInserts("t1");
    expect(inserts).toHaveLength(DEFAULT_UNITS.length);
    expect(inserts.every((u) => u.tenant_id === "t1")).toBe(true);
  });
});

describe("findNameClash", () => {
  const rows = [
    { id: "a", name: "Bread Flour" },
    { id: "b", name: "Sugar" },
  ];

  it("finds an existing ingredient with the same name, ignoring case and spaces", () => {
    expect(findNameClash("  bread flour ", rows, null)).toBe("Bread Flour");
  });

  it("ignores the ingredient being edited", () => {
    expect(findNameClash("Bread flour", rows, "a")).toBeNull();
  });

  it("is null for a blank or unique name", () => {
    expect(findNameClash("", rows, null)).toBeNull();
    expect(findNameClash("Salt", rows, null)).toBeNull();
  });
});
