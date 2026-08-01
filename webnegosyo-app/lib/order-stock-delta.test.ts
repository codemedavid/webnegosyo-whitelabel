/**
 * The inventory movement an order edit has to make.
 *
 * Placing an order already depleted stock. An edit must move only the
 * DIFFERENCE: adding an item depletes further, removing one puts it back.
 * Re-depleting the whole order, or forgetting to restore, silently corrupts
 * every stock count downstream.
 */

import { stockDelta } from "./order-stock-delta";
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

describe("stockDelta", () => {
  it("moves nothing when the items are unchanged", () => {
    expect(stockDelta([item()], [item()])).toEqual([]);
  });

  it("depletes further when an item is added", () => {
    expect(stockDelta([], [item({ quantity: 2 })])).toEqual([
      { menuItemId: "item-latte", quantityDelta: 2 },
    ]);
  });

  it("restores stock when an item is removed", () => {
    expect(stockDelta([item({ quantity: 2 })], [])).toEqual([
      { menuItemId: "item-latte", quantityDelta: -2 },
    ]);
  });

  it("moves only the difference when a quantity changes", () => {
    // 1 -> 3 must deplete 2 more, not 3.
    expect(stockDelta([item({ quantity: 1 })], [item({ quantity: 3 })])).toEqual([
      { menuItemId: "item-latte", quantityDelta: 2 },
    ]);
  });

  it("nets a swap of the same item across different modifiers to zero", () => {
    // Small -> Large is two different order lines but the SAME menu item, so
    // the stock count must not move.
    const before = [item({ subtotal: 100 })];
    const after = [
      item({
        price: 120,
        subtotal: 120,
        variationSelections: [
          { typeName: "Size", optionName: "Large", priceAdjustment: 20 },
        ],
      }),
    ];

    expect(stockDelta(before, after)).toEqual([]);
  });

  it("reports each menu item once across a mixed edit", () => {
    const before = [item({ quantity: 2 })];
    const after = [
      item({ quantity: 1 }),
      item({ menuItemId: "item-cake", menuItemName: "Cake", quantity: 3 }),
    ];

    expect(stockDelta(before, after)).toEqual(
      expect.arrayContaining([
        { menuItemId: "item-latte", quantityDelta: -1 },
        { menuItemId: "item-cake", quantityDelta: 3 },
      ]),
    );
    expect(stockDelta(before, after)).toHaveLength(2);
  });

  it("ignores lines with no menu item to move stock against", () => {
    // A menu item deleted after the sale leaves order items with a null id.
    expect(stockDelta([], [item({ menuItemId: "" })])).toEqual([]);
  });
});
