import {
  groupPortions,
  optionPortions,
  maxOptionPortions,
  selectionFor,
  setOptionPortions,
} from "./pos-addon-portions";
import {
  describeSelectionRule,
  isQuantityGroup,
  isSingleSelectGroup,
  normalizeModifierGroups,
  type ModifierGroup,
} from "./modifier-groups";
import { lineKey, unitPrice, validateSelection, type PosCartSelection } from "./pos-cart";
import type { OrderTypePricing } from "./order-type-pricing";

/**
 * Add-on portions at the register: "Fried Rice ×2" on one dish.
 *
 * Web checkout has let customers pick an amount of each add-on since quantity
 * groups shipped; the register only toggled them, so a cashier ringing up two
 * cups of rice on one plate had to add the dish twice or ring a second line.
 */

const ADDONS: ModifierGroup = {
  id: "g-addons",
  name: "Add-ons",
  selection_mode: "quantity",
  display_order: 0,
  min_select: 0,
  max_select: null,
  options: [
    { id: "o-rice", name: "Fried Rice", price_modifier: 15, display_order: 0 },
    { id: "o-egg", name: "Egg", price_modifier: 20, display_order: 1 },
  ],
};

const CAPPED: ModifierGroup = { ...ADDONS, id: "g-capped", max_select: 3 };

const GRAB_20: OrderTypePricing = { orderTypeId: "ot-grab", markupPercent: 20, itemPrices: {} };

const rice = ADDONS.options[0];
const egg = ADDONS.options[1];

describe("isQuantityGroup", () => {
  it("is true only for groups marked as add-on amounts", () => {
    expect(isQuantityGroup(ADDONS)).toBe(true);
    expect(isQuantityGroup({ ...ADDONS, selection_mode: "choice" })).toBe(false);
    expect(isQuantityGroup({ ...ADDONS, selection_mode: undefined })).toBe(false);
  });

  it("treats a dish's legacy add-ons as amounts, as the web does", () => {
    const [group] = normalizeModifierGroups({ addons: [{ id: "a1", name: "Egg", price: 20 }] });
    expect(isQuantityGroup(group)).toBe(true);
  });
});

describe("setOptionPortions", () => {
  it("adds an add-on at one portion", () => {
    const next = setOptionPortions([], ADDONS, rice, 1, null);
    expect(next).toEqual([
      { groupId: "g-addons", groupName: "Add-ons", optionId: "o-rice", optionName: "Fried Rice", priceModifier: 15, listPriceModifier: 15 },
    ]);
  });

  it("prices every portion and records the count", () => {
    const next = setOptionPortions([], ADDONS, rice, 3, null);
    expect(next[0]).toMatchObject({ portions: 3, priceModifier: 45, listPriceModifier: 45 });
    expect(unitPrice(100, next)).toBe(145);
  });

  it("marks up each portion for the channel", () => {
    const next = setOptionPortions([], ADDONS, rice, 2, GRAB_20);
    expect(next[0]).toMatchObject({ portions: 2, priceModifier: 36, listPriceModifier: 30 });
  });

  it("changes an amount in place, keeping the other picks where they were", () => {
    const start = setOptionPortions(setOptionPortions([], ADDONS, rice, 1, null), ADDONS, egg, 1, null);
    const next = setOptionPortions(start, ADDONS, rice, 2, null);
    expect(next.map((s) => [s.optionId, s.portions ?? 1])).toEqual([["o-rice", 2], ["o-egg", 1]]);
  });

  it("removes the add-on at zero", () => {
    const start = setOptionPortions([], ADDONS, rice, 2, null);
    expect(setOptionPortions(start, ADDONS, rice, 0, null)).toEqual([]);
  });

  it("refuses to go past the group's portion limit, counting every add-on", () => {
    const start = setOptionPortions([], CAPPED, egg, 2, null);
    expect(setOptionPortions(start, CAPPED, rice, 2, null)).toBe(start);
    expect(groupPortions(setOptionPortions(start, CAPPED, rice, 1, null), CAPPED.id)).toBe(3);
  });

  it("always lets an amount come down, even above a limit", () => {
    const over = [selectionFor(CAPPED, rice, null, 5)];
    expect(optionPortions(setOptionPortions(over, CAPPED, rice, 4, null), rice.id)).toBe(4);
  });

  it("ignores amounts that are not whole numbers from 0 to 99", () => {
    const start = setOptionPortions([], ADDONS, rice, 1, null);
    for (const bad of [-1, 1.5, 100, Number.NaN]) {
      expect(setOptionPortions(start, ADDONS, rice, bad, null)).toBe(start);
    }
  });

  it("does nothing for a pick-from-a-list group", () => {
    const choice: ModifierGroup = { ...ADDONS, selection_mode: "choice" };
    expect(setOptionPortions([], choice, rice, 2, null)).toEqual([]);
  });
});

describe("portions on the cart line", () => {
  it("keeps ×2 and ×1 of the same add-on on separate lines", () => {
    const one = setOptionPortions([], ADDONS, rice, 1, null);
    const two = setOptionPortions([], ADDONS, rice, 2, null);
    expect(lineKey("dish", one)).not.toBe(lineKey("dish", two));
  });

  it("counts portions, not picks, against a group's minimum and maximum", () => {
    const required: ModifierGroup = { ...CAPPED, min_select: 2 };
    const selections: PosCartSelection[] = [selectionFor(required, rice, null, 2)];
    expect(validateSelection([required], selections).valid).toBe(true);
    expect(validateSelection([required], [selectionFor(required, rice, null, 1)]).valid).toBe(false);
    expect(validateSelection([CAPPED], [selectionFor(CAPPED, rice, null, 4)]).valid).toBe(false);
  });
});

describe("sold-out and counted add-ons", () => {
  it("refuses a sold-out add-on", () => {
    const off = { ...rice, is_available: false };
    expect(maxOptionPortions(off)).toBe(0);
    expect(setOptionPortions([], ADDONS, off, 1, null)).toEqual([]);
  });

  it("stops at an add-on's own stock count, as web checkout does", () => {
    const counted = { ...egg, stock_mode: "simple" as const, stock_qty: 2 };
    const two = setOptionPortions([], ADDONS, counted, 2, null);
    expect(optionPortions(two, egg.id)).toBe(2);
    expect(setOptionPortions(two, ADDONS, counted, 3, null)).toBe(two);
    expect(maxOptionPortions({ ...egg, stock_mode: "none" })).toBe(99);
  });
});

describe("describeSelectionRule (web product page wording)", () => {
  it("counts portions for add-on amount groups", () => {
    expect(describeSelectionRule(ADDONS)).toBe("Optional — add any extras");
    expect(describeSelectionRule(CAPPED)).toBe("Optional — up to 3 portions");
    expect(describeSelectionRule({ ...CAPPED, min_select: 1 })).toBe("Required — 1 to 3 portions");
    expect(describeSelectionRule({ ...CAPPED, min_select: 3 })).toBe("Required — 3 portions");
    expect(describeSelectionRule({ ...ADDONS, min_select: 2 })).toBe("Required — at least 2 portions");
  });

  it("counts picks for pick-from-a-list groups", () => {
    const choice: ModifierGroup = { ...ADDONS, selection_mode: "choice" };
    expect(describeSelectionRule(choice)).toBe("Optional — choose any");
    expect(describeSelectionRule({ ...choice, max_select: 2 })).toBe("Optional — choose up to 2");
    expect(describeSelectionRule({ ...choice, min_select: 1, max_select: 1 })).toBe("Required — choose 1");
    expect(describeSelectionRule({ ...choice, min_select: 2, max_select: 3 })).toBe("Required — choose 2 to 3");
    expect(describeSelectionRule({ ...choice, min_select: 2, max_select: null })).toBe("Required — choose at least 2");
  });
});

describe("isSingleSelectGroup", () => {
  it("keeps an add-on amount group capped at one portion as add-ons, like the web", () => {
    expect(isSingleSelectGroup({ ...ADDONS, max_select: 1 })).toBe(false);
    expect(isSingleSelectGroup({ ...ADDONS, selection_mode: "choice", max_select: 1 })).toBe(true);
    expect(isSingleSelectGroup({ ...ADDONS, selection_mode: undefined, max_select: 1 })).toBe(true);
  });
});
