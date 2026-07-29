/**
 * The state behind the edit screen: what the order was, what it is now, and
 * what the cashier has to do about the difference.
 *
 * The screens are deliberately thin over this — `webnegosyo-app/jest.config.js`
 * scopes Jest to `lib/`, so anything worth proving has to live here.
 */

import { describeSession, startEditSession, applyCart } from "./order-edit-session";
import type { OrderItemDto } from "./backends/supabase-orders";
import type { ModifierGroup } from "./modifier-groups";

const SIZE_GROUP: ModifierGroup = {
  id: "grp-size",
  name: "Size",
  display_order: 0,
  min_select: 1,
  max_select: 1,
  options: [
    { id: "opt-small", name: "Small", price_modifier: 0, display_order: 0 },
    { id: "opt-large", name: "Large", price_modifier: 20, display_order: 1 },
  ],
};

const CATALOG = { "item-latte": [SIZE_GROUP] };

function orderItem(overrides: Partial<OrderItemDto> = {}): OrderItemDto {
  return {
    _id: "oi-1",
    orderId: "ord-1",
    menuItemId: "item-latte",
    menuItemName: "Latte",
    quantity: 1,
    price: 100,
    subtotal: 100,
    addons: [],
    ...overrides,
  };
}

const ORDER = {
  _id: "ord-1",
  total: 100,
  revisionNumber: 0,
  items: [orderItem()],
};

describe("startEditSession", () => {
  it("opens with the order's items already in the cart", () => {
    const session = startEditSession(ORDER, [{ kind: "charge", amount: 100 }], CATALOG);

    expect(session.cart).toHaveLength(1);
    expect(session.cart[0].name).toBe("Latte");
  });

  it("opens clean — nothing to save before the cashier touches anything", () => {
    const session = startEditSession(ORDER, [{ kind: "charge", amount: 100 }], CATALOG);

    expect(session.isDirty).toBe(false);
    expect(session.canSave).toBe(false);
  });

  it("opens settled when the order is fully paid and untouched", () => {
    const session = startEditSession(ORDER, [{ kind: "charge", amount: 100 }], CATALOG);

    expect(session.balance).toBe(0);
    expect(session.intent).toBe("settled");
  });

  it("opens owing the full total when nothing was paid", () => {
    const session = startEditSession(ORDER, [], CATALOG);

    expect(session.balance).toBe(100);
    expect(session.intent).toBe("collect");
  });

  it("carries the revision number the save will be checked against", () => {
    const session = startEditSession({ ...ORDER, revisionNumber: 4 }, [], CATALOG);

    expect(session.expectedRevisionNumber).toBe(4);
  });

  it("surfaces items whose menu entry has since been deleted", () => {
    const session = startEditSession(
      { ...ORDER, items: [orderItem({ menuItemId: "gone", menuItemName: "Retired" })] },
      [],
      CATALOG,
    );

    expect(session.warnings).not.toHaveLength(0);
  });
});

describe("applyCart", () => {
  const paid = [{ kind: "charge" as const, amount: 100 }];

  it("marks the session dirty once the cart differs", () => {
    const session = startEditSession(ORDER, paid, CATALOG);
    const next = applyCart(session, [{ ...session.cart[0], quantity: 2, subtotal: 200 }]);

    expect(next.isDirty).toBe(true);
    expect(next.canSave).toBe(true);
  });

  it("asks the cashier to collect when the edit raised the total", () => {
    const session = startEditSession(ORDER, paid, CATALOG);
    const next = applyCart(session, [{ ...session.cart[0], quantity: 2, subtotal: 200 }]);

    expect(next.newTotal).toBe(200);
    expect(next.balance).toBe(100);
    expect(next.intent).toBe("collect");
  });

  it("asks the cashier to refund when the edit lowered the total", () => {
    // Paid ₱100, item swapped for a cheaper one.
    const session = startEditSession(ORDER, paid, CATALOG);
    const next = applyCart(session, [
      { ...session.cart[0], basePrice: 60, unitPrice: 60, subtotal: 60 },
    ]);

    expect(next.balance).toBe(-40);
    expect(next.intent).toBe("refund");
  });

  it("goes back to clean when the cashier undoes their change", () => {
    const session = startEditSession(ORDER, paid, CATALOG);
    const changed = applyCart(session, [{ ...session.cart[0], quantity: 2, subtotal: 200 }]);
    const undone = applyCart(changed, session.cart);

    expect(undone.isDirty).toBe(false);
    expect(undone.canSave).toBe(false);
  });

  it("refuses to save an emptied cart", () => {
    // Emptying is a cancellation, which has its own path.
    const session = startEditSession(ORDER, paid, CATALOG);
    const next = applyCart(session, []);

    expect(next.canSave).toBe(false);
    expect(next.blockedReason).toMatch(/cancel/i);
  });

  it("never mutates the session it was given", () => {
    const session = startEditSession(ORDER, paid, CATALOG);
    applyCart(session, [{ ...session.cart[0], quantity: 9, subtotal: 900 }]);

    expect(session.cart[0].quantity).toBe(1);
    expect(session.newTotal).toBe(100);
  });

  it("keeps the original total for comparison after an edit", () => {
    const session = startEditSession(ORDER, paid, CATALOG);
    const next = applyCart(session, [{ ...session.cart[0], quantity: 2, subtotal: 200 }]);

    expect(next.originalTotal).toBe(100);
  });
});

describe("describeSession", () => {
  it("lists what changed, in words", () => {
    const session = startEditSession(ORDER, [], CATALOG);
    const next = applyCart(session, [{ ...session.cart[0], quantity: 3, subtotal: 300 }]);

    expect(describeSession(next)).toEqual(["Latte 1x to 3x"]);
  });

  it("says nothing when nothing changed", () => {
    expect(describeSession(startEditSession(ORDER, [], CATALOG))).toEqual([]);
  });
});
