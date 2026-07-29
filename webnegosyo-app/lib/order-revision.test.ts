/**
 * What changed between the order as placed and the order as edited.
 *
 * This diff is what makes "we should be able to know that" true: it is written
 * verbatim into the revision history a merchant reads back weeks later, and it
 * drives the stock movement the edit has to make.
 */

import { diffOrderItems, describeChange } from "./order-revision";
import type { RevisedOrderItem } from "./order-edit-cart";

function item(overrides: Partial<RevisedOrderItem> = {}): RevisedOrderItem {
  return {
    menuItemId: "item-latte",
    menuItemName: "Latte",
    quantity: 1,
    price: 100,
    subtotal: 100,
    ...overrides,
  };
}

const LARGE = [{ typeName: "Size", optionName: "Large", priceAdjustment: 20 }];

describe("diffOrderItems", () => {
  it("reports nothing when the order is untouched", () => {
    const before = [item()];

    expect(diffOrderItems(before, [item()])).toEqual([]);
  });

  it("reports an added item", () => {
    const change = diffOrderItems([], [item({ quantity: 2, subtotal: 200 })]);

    expect(change).toEqual([
      expect.objectContaining({
        kind: "added",
        menuItemName: "Latte",
        quantity: 2,
        subtotalDelta: 200,
      }),
    ]);
  });

  it("reports a removed item with a negative subtotal delta", () => {
    const change = diffOrderItems([item({ quantity: 2, subtotal: 200 })], []);

    expect(change).toEqual([
      expect.objectContaining({
        kind: "removed",
        menuItemName: "Latte",
        quantity: 2,
        subtotalDelta: -200,
      }),
    ]);
  });

  it("reports a quantity increase rather than an add plus a remove", () => {
    const change = diffOrderItems(
      [item({ quantity: 1, subtotal: 100 })],
      [item({ quantity: 3, subtotal: 300 })],
    );

    expect(change).toEqual([
      expect.objectContaining({
        kind: "quantity",
        quantityBefore: 1,
        quantityAfter: 3,
        subtotalDelta: 200,
      }),
    ]);
  });

  it("reports a quantity decrease", () => {
    const change = diffOrderItems(
      [item({ quantity: 3, subtotal: 300 })],
      [item({ quantity: 1, subtotal: 100 })],
    );

    expect(change[0]).toMatchObject({ kind: "quantity", subtotalDelta: -200 });
  });

  it("treats a changed modifier as a different line, not a repricing", () => {
    // Small -> Large is a remove plus an add: they are different products as
    // far as the kitchen and the stock ledger are concerned.
    const change = diffOrderItems(
      [item({ subtotal: 100 })],
      [item({ price: 120, subtotal: 120, variationSelections: LARGE })],
    );

    expect(change.map((c) => c.kind).sort()).toEqual(["added", "removed"]);
  });

  it("reports a price change on an otherwise identical line", () => {
    // The merchant raised the menu price between placing and editing.
    const change = diffOrderItems(
      [item({ price: 100, subtotal: 100 })],
      [item({ price: 110, subtotal: 110 })],
    );

    expect(change).toEqual([
      expect.objectContaining({
        kind: "repriced",
        priceBefore: 100,
        priceAfter: 110,
        subtotalDelta: 10,
      }),
    ]);
  });

  it("keeps two different items apart", () => {
    const change = diffOrderItems(
      [item()],
      [item(), item({ menuItemId: "item-cake", menuItemName: "Cake", subtotal: 150, price: 150 })],
    );

    expect(change).toEqual([
      expect.objectContaining({ kind: "added", menuItemName: "Cake" }),
    ]);
  });

  it("keeps lines with different kitchen notes apart", () => {
    const change = diffOrderItems(
      [item({ specialInstructions: "No sugar" })],
      [item({ specialInstructions: "Extra hot" })],
    );

    expect(change).toHaveLength(2);
  });

  it("sums to the true total change across a mixed edit", () => {
    // Swapped a Latte for a Cake and doubled nothing else: the deltas must
    // reconcile to the difference in order totals, or the balance is a lie.
    const before = [item({ quantity: 2, subtotal: 200 })];
    const after = [item({ menuItemId: "item-cake", menuItemName: "Cake", price: 150, subtotal: 150 })];

    const net = diffOrderItems(before, after).reduce((sum, c) => sum + c.subtotalDelta, 0);

    expect(net).toBe(-50);
  });
});

describe("describeChange", () => {
  it("describes an addition in words a merchant can read back", () => {
    expect(
      describeChange({
        kind: "added",
        menuItemName: "Latte",
        quantity: 2,
        subtotalDelta: 200,
      }),
    ).toBe("Added 2x Latte");
  });

  it("describes a removal", () => {
    expect(
      describeChange({
        kind: "removed",
        menuItemName: "Latte",
        quantity: 1,
        subtotalDelta: -100,
      }),
    ).toBe("Removed 1x Latte");
  });

  it("describes a quantity change with both numbers", () => {
    expect(
      describeChange({
        kind: "quantity",
        menuItemName: "Latte",
        quantityBefore: 1,
        quantityAfter: 3,
        subtotalDelta: 200,
      }),
    ).toBe("Latte 1x to 3x");
  });

  it("describes a repricing", () => {
    expect(
      describeChange({
        kind: "repriced",
        menuItemName: "Latte",
        priceBefore: 100,
        priceAfter: 110,
        subtotalDelta: 10,
      }),
    ).toBe("Latte repriced 100 to 110");
  });
});
