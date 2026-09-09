/**
 * The glue between the pure order-type pricing module and the register cart.
 *
 * The invariant every case guards: pricing is derived from the LIST price the
 * line was rung up with, never from the current `basePrice`. A markup that
 * compounded on itself each time the cashier switched chips would charge a
 * different figure for the same dish depending on how many times they
 * changed their mind.
 */

import type { OrderTypePricing } from "./order-type-pricing";
import { addLine, type PosCartLine, type PosLineInput } from "./pos-cart";
import {
  displayPriceForOrderType,
  priceLineInputForOrderType,
  priceSelectionsForOrderType,
  repriceLinesForOrderType,
} from "./pos-order-type-pricing";

const GRAB_20: OrderTypePricing = {
  orderTypeId: "ot-grab",
  markupPercent: 20,
  itemPrices: {},
};

const GRAB_OVERRIDE: OrderTypePricing = {
  orderTypeId: "ot-grab",
  markupPercent: 20,
  itemPrices: { "m-meal": 150 },
};

const EXTRA_SHOT = {
  groupId: "g-shots",
  groupName: "Shots",
  optionId: "o-extra",
  optionName: "Extra shot",
  priceModifier: 10,
  listPriceModifier: 10,
};

/** A line hydrated from a placed order: priced as quoted, no list figure. */
const HYDRATED_LATTE: PosLineInput = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 100,
  quantity: 2,
  selections: [EXTRA_SHOT],
};

const LATTE: PosLineInput = { ...HYDRATED_LATTE, listBasePrice: 100 };

describe("priceSelectionsForOrderType", () => {
  it("marks up each modifier from its list figure", () => {
    const [shot] = priceSelectionsForOrderType([EXTRA_SHOT], GRAB_20);
    expect(shot.priceModifier).toBe(12);
    expect(shot.listPriceModifier).toBe(10);
  });

  it("restores the list figure when pricing is removed", () => {
    const marked = priceSelectionsForOrderType([EXTRA_SHOT], GRAB_20);
    const [shot] = priceSelectionsForOrderType(marked, null);
    expect(shot.priceModifier).toBe(10);
  });

  it("falls back to the current modifier for a selection with no list figure", () => {
    const legacy = { ...EXTRA_SHOT, listPriceModifier: undefined };
    const [shot] = priceSelectionsForOrderType([legacy], GRAB_20);
    expect(shot.priceModifier).toBe(12);
    expect(shot.listPriceModifier).toBe(10);
  });
});

describe("priceLineInputForOrderType", () => {
  it("marks up the base and keeps the list price as the source of truth", () => {
    const priced = priceLineInputForOrderType(LATTE, GRAB_20);
    expect(priced.basePrice).toBe(120);
    expect(priced.listBasePrice).toBe(100);
    expect(priced.selections[0].priceModifier).toBe(12);
  });

  it("uses an exact override for the base while modifiers still take the markup", () => {
    const meal = { ...LATTE, menuItemId: "m-meal" };
    const priced = priceLineInputForOrderType(meal, GRAB_OVERRIDE);
    expect(priced.basePrice).toBe(150);
    expect(priced.selections[0].priceModifier).toBe(12);
    expect(addLine([], priced)[0].unitPrice).toBe(162);
  });

  it("leaves the input unchanged with no pricing", () => {
    expect(priceLineInputForOrderType(LATTE, null)).toEqual(LATTE);
  });

  it("returns an input with no list price by reference — edit lines are never repriced", () => {
    expect(priceLineInputForOrderType(HYDRATED_LATTE, GRAB_20)).toBe(HYDRATED_LATTE);
  });
});

describe("repriceLinesForOrderType", () => {
  const cart = (): PosCartLine[] => addLine([], LATTE);

  it("re-derives unit price and subtotal from the list price", () => {
    const [line] = repriceLinesForOrderType(cart(), GRAB_20);
    expect(line.basePrice).toBe(120);
    expect(line.unitPrice).toBe(132);
    expect(line.subtotal).toBe(264);
  });

  it("keeps subtotal = unit × quantity", () => {
    const [line] = repriceLinesForOrderType(cart(), GRAB_20);
    expect(line.subtotal).toBe(line.unitPrice * line.quantity);
  });

  it("restores list prices when pricing is removed", () => {
    const marked = repriceLinesForOrderType(cart(), GRAB_20);
    const [line] = repriceLinesForOrderType(marked, null);
    expect(line.basePrice).toBe(100);
    expect(line.unitPrice).toBe(110);
    expect(line.subtotal).toBe(220);
  });

  it("is idempotent — repricing twice never compounds", () => {
    const once = repriceLinesForOrderType(cart(), GRAB_20);
    const twice = repriceLinesForOrderType(once, GRAB_20);
    expect(twice).toEqual(once);
  });

  it("keeps the line key stable so the sale still stacks", () => {
    const [before] = cart();
    const [after] = repriceLinesForOrderType(cart(), GRAB_20);
    expect(after.key).toBe(before.key);
  });

  it("returns an edit-shape line (no list price) by the same reference", () => {
    const [placed] = addLine([], HYDRATED_LATTE);
    const [after] = repriceLinesForOrderType([placed], GRAB_20);
    expect(after).toBe(placed);
  });

  it("returns a new array and leaves the input cart untouched", () => {
    const original = cart();
    const repriced = repriceLinesForOrderType(original, GRAB_20);
    expect(repriced).not.toBe(original);
    expect(original[0].basePrice).toBe(100);
  });
});

describe("displayPriceForOrderType", () => {
  it("prices the tile from the discounted price when there is one", () => {
    expect(
      displayPriceForOrderType({ id: "m-latte", price: 100, discounted_price: 80 }, GRAB_20),
    ).toBe(96);
  });

  it("prices the tile from the list price when there is no discount", () => {
    expect(
      displayPriceForOrderType({ id: "m-latte", price: 100, discounted_price: null }, GRAB_20),
    ).toBe(120);
  });

  it("shows the exact override for an item that has one", () => {
    expect(
      displayPriceForOrderType({ id: "m-meal", price: 100, discounted_price: null }, GRAB_OVERRIDE),
    ).toBe(150);
  });

  it("shows the store price with no pricing", () => {
    expect(
      displayPriceForOrderType({ id: "m-latte", price: 100, discounted_price: null }, null),
    ).toBe(100);
  });
});
