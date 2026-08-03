import {
  addLine,
  cartTotals,
  clearCart,
  lineKey,
  quantityByItem,
  removeLine,
  unitPrice,
  updateQty,
  validateSelection,
  type PosCartLine,
  type PosCartSelection,
  type PosLineInput,
} from "./pos-cart";
import type { ModifierGroup } from "./modifier-groups";

const large: PosCartSelection = {
  groupId: "g-size",
  groupName: "Size",
  optionId: "o-large",
  optionName: "Large",
  priceModifier: 20,
};
const small: PosCartSelection = {
  groupId: "g-size",
  groupName: "Size",
  optionId: "o-small",
  optionName: "Small",
  priceModifier: 0,
};
const extraShot: PosCartSelection = {
  groupId: "g-addons",
  groupName: "Add-ons",
  optionId: "o-shot",
  optionName: "Extra Shot",
  priceModifier: 15,
};

const latte: PosLineInput = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 120,
  quantity: 1,
  selections: [],
};

describe("unitPrice", () => {
  it("adds every selected option's modifier to the base price", () => {
    expect(unitPrice(120, [large, extraShot])).toBe(155);
  });

  it("returns the base price when nothing is selected", () => {
    expect(unitPrice(120, [])).toBe(120);
  });

  it("rounds to centavos", () => {
    expect(unitPrice(10.1, [{ ...large, priceModifier: 0.2 }])).toBe(10.3);
  });

  it("never returns a negative price even with an over-large discount modifier", () => {
    expect(unitPrice(50, [{ ...large, priceModifier: -80 }])).toBe(0);
  });
});

describe("lineKey", () => {
  it("is stable regardless of the order options were selected in", () => {
    expect(lineKey("m-latte", [large, extraShot])).toBe(lineKey("m-latte", [extraShot, large]));
  });

  it("separates different option sets on the same item", () => {
    expect(lineKey("m-latte", [large])).not.toBe(lineKey("m-latte", [small]));
  });

  it("separates different items with identical options", () => {
    expect(lineKey("m-latte", [large])).not.toBe(lineKey("m-mocha", [large]));
  });

  it("separates lines carrying different kitchen notes", () => {
    expect(lineKey("m-latte", [], "no ice")).not.toBe(lineKey("m-latte", [], "extra ice"));
  });
});

describe("addLine", () => {
  it("appends a priced line to an empty cart", () => {
    const cart = addLine([], { ...latte, selections: [large] });
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({
      menuItemId: "m-latte",
      name: "Latte",
      quantity: 1,
      unitPrice: 140,
      subtotal: 140,
    });
  });

  it("stacks quantity when the same item with the same options is rung up twice", () => {
    const cart = addLine(addLine([], latte), latte);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].subtotal).toBe(240);
  });

  it("keeps differently-configured lines of the same item apart", () => {
    const cart = addLine(addLine([], { ...latte, selections: [large] }), {
      ...latte,
      selections: [small],
    });
    expect(cart).toHaveLength(2);
  });

  it("respects a quantity greater than one", () => {
    const cart = addLine([], { ...latte, quantity: 3 });
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].subtotal).toBe(360);
  });

  it("does not mutate the cart it was given", () => {
    const before: PosCartLine[] = addLine([], latte);
    const snapshot = JSON.stringify(before);
    addLine(before, latte);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("ignores a non-positive quantity instead of creating a zero line", () => {
    expect(addLine([], { ...latte, quantity: 0 })).toEqual([]);
    expect(addLine([], { ...latte, quantity: -2 })).toEqual([]);
  });
});

describe("updateQty", () => {
  it("resets the quantity and recomputes the subtotal", () => {
    const cart = updateQty(addLine([], latte), lineKey("m-latte", []), 4);
    expect(cart[0].quantity).toBe(4);
    expect(cart[0].subtotal).toBe(480);
  });

  it("removes the line when the quantity drops to zero or below", () => {
    const cart = addLine([], latte);
    expect(updateQty(cart, lineKey("m-latte", []), 0)).toEqual([]);
    expect(updateQty(cart, lineKey("m-latte", []), -1)).toEqual([]);
  });

  it("leaves the cart untouched for an unknown key", () => {
    const cart = addLine([], latte);
    expect(updateQty(cart, "nope", 5)).toEqual(cart);
  });

  it("does not mutate the cart it was given", () => {
    const before = addLine([], latte);
    const snapshot = JSON.stringify(before);
    updateQty(before, lineKey("m-latte", []), 9);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("removeLine", () => {
  it("drops only the targeted line", () => {
    const cart = addLine(addLine([], { ...latte, selections: [large] }), {
      ...latte,
      selections: [small],
    });
    const remaining = removeLine(cart, lineKey("m-latte", [large]));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].selections[0].optionName).toBe("Small");
  });

  it("does not mutate the cart it was given", () => {
    const before = addLine([], latte);
    removeLine(before, lineKey("m-latte", []));
    expect(before).toHaveLength(1);
  });
});

describe("clearCart", () => {
  it("returns an empty cart", () => {
    expect(clearCart()).toEqual([]);
  });
});

describe("cartTotals", () => {
  it("sums line subtotals and counts units, not lines", () => {
    const cart = addLine(addLine([], { ...latte, quantity: 2 }), {
      ...latte,
      selections: [large],
    });
    expect(cartTotals(cart)).toEqual({
      subtotal: 380,
      serviceCharge: 0,
      discountTotal: 0,
      total: 380,
      itemCount: 3,
    });
  });

  it("returns zeroes for an empty cart", () => {
    expect(cartTotals([])).toEqual({
      subtotal: 0,
      serviceCharge: 0,
      discountTotal: 0,
      total: 0,
      itemCount: 0,
    });
  });

  it("applies a percentage service charge on top of the subtotal", () => {
    const cart = addLine([], { ...latte, quantity: 2 }); // 240
    expect(cartTotals(cart, { type: "percentage", value: 10 })).toEqual({
      subtotal: 240,
      serviceCharge: 24,
      discountTotal: 0,
      total: 264,
      itemCount: 2,
    });
  });

  it("applies a fixed service charge once, not per item", () => {
    const cart = addLine([], { ...latte, quantity: 3 }); // 360
    expect(cartTotals(cart, { type: "fixed", value: 25 })).toEqual({
      subtotal: 360,
      serviceCharge: 25,
      discountTotal: 0,
      total: 385,
      itemCount: 3,
    });
  });

  it("charges nothing extra when the order type has no service charge", () => {
    const cart = addLine([], latte);
    expect(cartTotals(cart, undefined).total).toBe(120);
  });

  it("never charges a service fee on an empty cart", () => {
    expect(cartTotals([], { type: "fixed", value: 25 })).toEqual({
      subtotal: 0,
      serviceCharge: 0,
      discountTotal: 0,
      total: 0,
      itemCount: 0,
    });
  });

  it("rounds the service charge to centavos", () => {
    const cart = addLine([], { ...latte, basePrice: 99.99 });
    expect(cartTotals(cart, { type: "percentage", value: 12 }).serviceCharge).toBe(12);
  });
});

describe("validateSelection", () => {
  const sizeGroup: ModifierGroup = {
    id: "g-size",
    name: "Size",
    display_order: 0,
    min_select: 1,
    max_select: 1,
    options: [
      { id: "o-small", name: "Small", price_modifier: 0, display_order: 0 },
      { id: "o-large", name: "Large", price_modifier: 20, display_order: 1 },
    ],
  };
  const addonGroup: ModifierGroup = {
    id: "g-addons",
    name: "Add-ons",
    display_order: 1,
    min_select: 0,
    max_select: null,
    options: [
      { id: "o-shot", name: "Extra Shot", price_modifier: 15, display_order: 0 },
      { id: "o-syrup", name: "Syrup", price_modifier: 10, display_order: 1 },
    ],
  };

  it("accepts a complete selection", () => {
    expect(validateSelection([sizeGroup, addonGroup], [large, extraShot])).toEqual({
      valid: true,
      errors: {},
    });
  });

  it("flags a required group left unselected", () => {
    const result = validateSelection([sizeGroup], []);
    expect(result.valid).toBe(false);
    expect(result.errors["g-size"]).toContain("Size");
  });

  it("allows an optional group to be skipped", () => {
    expect(validateSelection([addonGroup], []).valid).toBe(true);
  });

  it("flags exceeding a group's maximum", () => {
    const result = validateSelection([sizeGroup], [small, large]);
    expect(result.valid).toBe(false);
    expect(result.errors["g-size"]).toBeDefined();
  });

  it("allows unlimited picks when max_select is null", () => {
    const bothAddons = [
      extraShot,
      { ...extraShot, optionId: "o-syrup", optionName: "Syrup", priceModifier: 10 },
    ];
    expect(validateSelection([addonGroup], bothAddons).valid).toBe(true);
  });

  it("accepts an item with no modifier groups at all", () => {
    expect(validateSelection([], [])).toEqual({ valid: true, errors: {} });
  });
});

describe("quantityByItem", () => {
  const latte = {
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 100,
    quantity: 1,
    selections: [] as PosCartSelection[],
  };

  it("returns an empty map for an empty cart", () => {
    expect(quantityByItem([])).toEqual({});
  });

  it("counts units, not lines", () => {
    const cart = addLine([], { ...latte, quantity: 3 });
    expect(quantityByItem(cart)).toEqual({ "m-latte": 3 });
  });

  it("sums separate lines of the same item so the tile badge shows the true count", () => {
    const cart = addLine(addLine([], { ...latte, quantity: 2 }), {
      ...latte,
      quantity: 1,
      note: "no sugar",
    });
    expect(quantityByItem(cart)).toEqual({ "m-latte": 3 });
  });

  it("keeps different items separate", () => {
    const cart = addLine(addLine([], latte), {
      ...latte,
      menuItemId: "m-mocha",
      name: "Mocha",
      quantity: 4,
    });
    expect(quantityByItem(cart)).toEqual({ "m-latte": 1, "m-mocha": 4 });
  });
});

/**
 * Discounts at the register.
 *
 * The semantics must match `computeOrderTotals` on the web exactly, because
 * the same voucher can be presented at either. Divergence here means a code
 * worth one figure online and another in the shop.
 */
describe("cartTotals with discounts", () => {
  const twoLattes = addLine([], { ...latte, quantity: 2 }); // 240

  it("takes the discount off the total", () => {
    const totals = cartTotals(twoLattes, undefined, [
      { label: "WELCOME10", amount: 24 },
    ]);

    expect(totals.total).toBe(216);
    expect(totals.discountTotal).toBe(24);
  });

  it("leaves the subtotal alone, so the receipt can show what was taken off", () => {
    const totals = cartTotals(twoLattes, undefined, [
      { label: "WELCOME10", amount: 24 },
    ]);

    expect(totals.subtotal).toBe(240);
  });

  it("discounts the service charge too, matching the web", () => {
    // The web applies the discount to subtotal + delivery + service charge, so
    // a ₱300 voucher on a ₱240 cart with a ₱24 charge leaves ₱0, not ₱24.
    const totals = cartTotals(twoLattes, { type: "percentage", value: 10 }, [
      { label: "BIG", amount: 300 },
    ]);

    expect(totals.total).toBe(0);
  });

  it("never turns an over-large voucher into a refund", () => {
    const totals = cartTotals(twoLattes, undefined, [
      { label: "HUGE", amount: 1000 },
    ]);

    expect(totals.total).toBe(0);
    expect(totals.discountTotal).toBe(240);
  });

  it("stacks multiple discount lines", () => {
    const totals = cartTotals(twoLattes, undefined, [
      { label: "A", amount: 20 },
      { label: "B", amount: 15 },
    ]);

    expect(totals.discountTotal).toBe(35);
    expect(totals.total).toBe(205);
  });

  it("ignores a corrupt discount amount rather than billing it", () => {
    // A negative amount would ADD to the bill if summed naively.
    const totals = cartTotals(twoLattes, undefined, [
      { label: "BAD", amount: -50 },
      { label: "ALSO BAD", amount: Number.NaN },
      { label: "GOOD", amount: 10 },
    ]);

    expect(totals.discountTotal).toBe(10);
    expect(totals.total).toBe(230);
  });

  it("reports no discount when none is passed", () => {
    expect(cartTotals(twoLattes).discountTotal).toBe(0);
  });

  it("reports no discount on an empty cart", () => {
    // An empty cart short-circuits; it must still answer the same shape.
    expect(cartTotals([], undefined, [{ label: "X", amount: 50 }])).toEqual({
      subtotal: 0,
      serviceCharge: 0,
      discountTotal: 0,
      total: 0,
      itemCount: 0,
    });
  });
});
