/**
 * Per-order-type register pricing, decided in one pure place.
 *
 * A Grab order carries a commission, so the register charges more for it than
 * for a walk-in. Each order type may carry a markup percent; each item may
 * carry an exact override for that type. The single most important property:
 * no pricing (no row, no markup, unknown type) leaves the store price exactly
 * as it is — the behaviour every tenant has today.
 *
 * An exact override replaces the BASE price only; modifiers still get the
 * markup, otherwise a ₱150 Grab meal with a ₱10 add-on undercharges the add-on.
 */

import {
  MARKUP_PERCENT_MAX,
  MARKUP_PERCENT_MIN,
  applyMarkup,
  buildOrderTypePriceIndex,
  isValidMarkupPercent,
  pricingForOrderType,
  resolveItemPrice,
  resolveModifierPrice,
  round2,
  type OrderTypeItemPriceRow,
  type OrderTypePricing,
} from "./order-type-pricing";

const pricing = (over: Partial<OrderTypePricing> = {}): OrderTypePricing => ({
  orderTypeId: "ot-grab",
  markupPercent: 20,
  itemPrices: {},
  ...over,
});

describe("round2", () => {
  it("rounds to two decimals half-up", () => {
    expect(round2(112.494)).toBe(112.49);
    expect(round2(112.495)).toBe(112.5);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(100)).toBe(100);
  });
});

describe("isValidMarkupPercent", () => {
  it("accepts null and anything inside the range", () => {
    expect(isValidMarkupPercent(null)).toBe(true);
    expect(isValidMarkupPercent(0)).toBe(true);
    expect(isValidMarkupPercent(MARKUP_PERCENT_MIN)).toBe(true);
    expect(isValidMarkupPercent(MARKUP_PERCENT_MAX)).toBe(true);
    expect(isValidMarkupPercent(12.5)).toBe(true);
  });

  it("rejects out-of-range, NaN and non-numbers", () => {
    expect(isValidMarkupPercent(MARKUP_PERCENT_MIN - 1)).toBe(false);
    expect(isValidMarkupPercent(MARKUP_PERCENT_MAX + 1)).toBe(false);
    expect(isValidMarkupPercent(Number.NaN)).toBe(false);
    expect(isValidMarkupPercent("20")).toBe(false);
    expect(isValidMarkupPercent(undefined)).toBe(false);
  });
});

describe("applyMarkup", () => {
  it("leaves the amount unchanged with no markup", () => {
    expect(applyMarkup(100, null)).toBe(100);
    expect(applyMarkup(100, 0)).toBe(100);
    expect(applyMarkup(100, undefined)).toBe(100);
  });

  it("applies the percent and rounds to two decimals", () => {
    expect(applyMarkup(100, 20)).toBe(120);
    expect(applyMarkup(99.99, 12.5)).toBe(112.49);
  });

  it("floors at zero for a full discount", () => {
    expect(applyMarkup(100, -100)).toBe(0);
  });

  it("clamps the percent to the allowed range", () => {
    expect(applyMarkup(100, 600)).toBe(applyMarkup(100, MARKUP_PERCENT_MAX));
    expect(applyMarkup(100, 600)).toBe(600);
    expect(applyMarkup(100, -150)).toBe(0);
  });

  it("leaves the amount unchanged for a NaN percent", () => {
    expect(applyMarkup(100, Number.NaN)).toBe(100);
  });

  it("leaves a NaN amount alone rather than inventing a price", () => {
    expect(applyMarkup(Number.NaN, 20)).toBeNaN();
  });
});

describe("buildOrderTypePriceIndex", () => {
  it("groups rows by order type then item", () => {
    const rows: OrderTypeItemPriceRow[] = [
      { order_type_id: "ot-grab", menu_item_id: "item-1", price: 150 },
      { order_type_id: "ot-grab", menu_item_id: "item-2", price: 80 },
      { order_type_id: "ot-fp", menu_item_id: "item-1", price: 160 },
    ];

    expect(buildOrderTypePriceIndex(rows)).toEqual({
      "ot-grab": { "item-1": 150, "item-2": 80 },
      "ot-fp": { "item-1": 160 },
    });
  });

  it("coerces string numerics from the numeric column", () => {
    const rows: OrderTypeItemPriceRow[] = [
      { order_type_id: "ot-grab", menu_item_id: "item-1", price: "150.50" },
    ];

    expect(buildOrderTypePriceIndex(rows)).toEqual({
      "ot-grab": { "item-1": 150.5 },
    });
  });

  it("skips rows whose price is not a finite number", () => {
    const rows: OrderTypeItemPriceRow[] = [
      { order_type_id: "ot-grab", menu_item_id: "item-1", price: "abc" },
      { order_type_id: "ot-grab", menu_item_id: "item-2", price: null },
      { order_type_id: "ot-grab", menu_item_id: "item-3", price: 90 },
    ];

    expect(buildOrderTypePriceIndex(rows)).toEqual({
      "ot-grab": { "item-3": 90 },
    });
  });

  it("lets the last duplicate win", () => {
    const rows: OrderTypeItemPriceRow[] = [
      { order_type_id: "ot-grab", menu_item_id: "item-1", price: 150 },
      { order_type_id: "ot-grab", menu_item_id: "item-1", price: 175 },
    ];

    expect(buildOrderTypePriceIndex(rows)).toEqual({
      "ot-grab": { "item-1": 175 },
    });
  });

  it("returns an empty index for no rows", () => {
    expect(buildOrderTypePriceIndex([])).toEqual({});
  });
});

describe("pricingForOrderType", () => {
  const index = buildOrderTypePriceIndex([
    { order_type_id: "ot-grab", menu_item_id: "item-1", price: 150 },
  ]);

  it("returns null when there is no order type", () => {
    expect(pricingForOrderType(null, index)).toBeNull();
    expect(pricingForOrderType(undefined, index)).toBeNull();
  });

  it("carries the markup and the item map for a known type", () => {
    expect(
      pricingForOrderType({ id: "ot-grab", markupPercent: 25 }, index),
    ).toEqual({
      orderTypeId: "ot-grab",
      markupPercent: 25,
      itemPrices: { "item-1": 150 },
    });
  });

  it("yields an empty map with the markup carried for a type absent from the index", () => {
    expect(
      pricingForOrderType({ id: "ot-dine", markupPercent: 10 }, index),
    ).toEqual({ orderTypeId: "ot-dine", markupPercent: 10, itemPrices: {} });
  });

  it("reads an undefined markup as null", () => {
    expect(pricingForOrderType({ id: "ot-dine" }, index)).toEqual({
      orderTypeId: "ot-dine",
      markupPercent: null,
      itemPrices: {},
    });
  });
});

describe("resolveItemPrice", () => {
  it("returns the list price unchanged with no pricing", () => {
    expect(resolveItemPrice("item-1", 100, null)).toBe(100);
    expect(resolveItemPrice("item-1", 100, undefined)).toBe(100);
  });

  it("applies the markup to the list price", () => {
    expect(
      resolveItemPrice("item-1", 100, pricing({ markupPercent: 20 })),
    ).toBe(120);
  });

  it("returns the list price when the markup is null", () => {
    expect(
      resolveItemPrice("item-1", 100, pricing({ markupPercent: null })),
    ).toBe(100);
  });

  it("lets an exact override beat the markup for that item only", () => {
    const grab = pricing({ markupPercent: 20, itemPrices: { "item-1": 150 } });

    expect(resolveItemPrice("item-1", 100, grab)).toBe(150);
    expect(resolveItemPrice("item-2", 100, grab)).toBe(120);
  });

  it("does not apply the markup on top of an override", () => {
    const grab = pricing({ markupPercent: 500, itemPrices: { "item-1": 150 } });

    expect(resolveItemPrice("item-1", 100, grab)).toBe(150);
  });
});

describe("resolveModifierPrice", () => {
  it("returns the modifier unchanged with no pricing", () => {
    expect(resolveModifierPrice(10, null)).toBe(10);
    expect(resolveModifierPrice(10, undefined)).toBe(10);
  });

  it("applies the markup to the modifier", () => {
    expect(resolveModifierPrice(10, pricing({ markupPercent: 20 }))).toBe(12);
  });

  it("ignores item overrides — they replace the base price only", () => {
    const grab = pricing({ markupPercent: 20, itemPrices: { "item-1": 150 } });

    expect(resolveModifierPrice(10, grab)).toBe(12);
  });

  it("keeps a zero modifier at zero", () => {
    expect(resolveModifierPrice(0, pricing({ markupPercent: 20 }))).toBe(0);
  });
});
