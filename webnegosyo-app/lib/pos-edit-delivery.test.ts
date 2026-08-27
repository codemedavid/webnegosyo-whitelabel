/**
 * Attaching or correcting a delivery fee on a PLACED order.
 *
 * Two halves, and both must hold or the money splits:
 *
 * 1. The edit screen must be able to CHANGE the fee — historically it was
 *    "carried across untouched; the register cannot recompute it", which also
 *    meant a wrongly-typed fee could never be fixed and a phoned-in delivery
 *    taken on a placed order could never charge one.
 * 2. The revision must PERSIST the fee it totalled with. `buildRevisionRows`
 *    computed the total FROM `args.deliveryFee` but never wrote the
 *    `delivery_fee` column, so a revised fee changed the bill while the stored
 *    breakdown kept saying the old figure.
 */

import {
  editModeTotals,
  enterEditMode,
  withEditDeliveryFee,
} from "./pos-edit-mode";
import { buildRevisionRows, type ReviseOrderArgs } from "./backends/order-revise";
import type { ModifierCatalog } from "./order-edit-cart";
import type { OrderItemDto } from "./backends/supabase-orders";

const EMPTY_CATALOG: ModifierCatalog = {};

function orderItem(overrides: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    _id: "oi-1",
    orderId: "order-1",
    menuItemId: "item-latte",
    menuItemName: "Latte",
    quantity: 2,
    price: 100,
    subtotal: 200,
    addons: [],
    ...overrides,
  };
}

/** A delivery order: ₱200 of food, ₱50 to deliver it, ₱10 service charge. */
function deliveryOrder() {
  return {
    _id: "order-1",
    total: 260,
    revisionNumber: 0,
    deliveryFee: 50,
    items: [orderItem()],
  };
}

describe("withEditDeliveryFee", () => {
  const entered = enterEditMode(deliveryOrder(), [], EMPTY_CATALOG);

  it("re-prices the order with the new fee, carried charges untouched", () => {
    const context = withEditDeliveryFee(entered.context, 80);

    expect(context.deliveryFee).toBe(80);
    expect(context.carriedCharges).toBe(entered.context.carriedCharges);
    // ₱200 items + ₱80 fee + ₱10 carried charge.
    expect(editModeTotals(entered.cart, context, []).newTotal).toBe(290);
  });

  it("returns a new context rather than mutating the held one", () => {
    const context = withEditDeliveryFee(entered.context, 80);
    expect(context).not.toBe(entered.context);
    expect(entered.context.deliveryFee).toBe(50);
  });

  it("makes a fee-only change saveable", () => {
    // The item diff is empty — the whole edit is the fee — and a Save button
    // that stays dead is a correction that cannot be made.
    const totals = editModeTotals(entered.cart, withEditDeliveryFee(entered.context, 80), []);
    expect(totals.isDirty).toBe(true);
    expect(totals.canSave).toBe(true);
  });

  it("does not report dirty when the fee is set back to what it was", () => {
    const totals = editModeTotals(entered.cart, withEditDeliveryFee(entered.context, 50), []);
    expect(totals.isDirty).toBe(false);
  });

  it("allows removing the fee entirely, and refuses a corrupt one", () => {
    expect(withEditDeliveryFee(entered.context, 0).deliveryFee).toBe(0);
    expect(withEditDeliveryFee(entered.context, -20).deliveryFee).toBe(0);
    expect(withEditDeliveryFee(entered.context, Number.NaN).deliveryFee).toBe(0);
  });
});

describe("buildRevisionRows — delivery fee persistence", () => {
  const args: ReviseOrderArgs = {
    orderId: "order-1",
    expectedRevisionNumber: 0,
    items: [
      { menuItemId: "item-latte", menuItemName: "Latte", quantity: 2, price: 100, subtotal: 200 },
    ],
    deliveryFee: 80,
    serviceChargeAmount: 10,
  };

  const previous = {
    revisionNumber: 0,
    status: "confirmed",
    total: 260,
    items: args.items,
  };

  it("writes the fee it totalled with into the breakdown column", () => {
    const { orderPatch } = buildRevisionRows("tenant-1", args, previous);
    expect(orderPatch.total).toBe(290);
    expect(orderPatch.delivery_fee).toBe(80);
  });

  it("clears the column when the revision has no fee", () => {
    const { orderPatch } = buildRevisionRows(
      "tenant-1",
      { ...args, deliveryFee: 0 },
      previous,
    );
    expect(orderPatch.delivery_fee).toBeNull();
  });
});
