/**
 * Writing a kitchen note on a register line, driven through the REAL store.
 *
 * A note is part of a line's identity, so adding one re-keys the line. The
 * register holds a cashier's item discount (and voucher unit picks, and Senior
 * claims) by line key; before `setLineNote` existed those were dropped by
 * `discountAfterCartChange` the moment the key changed — a "No onion" note
 * would quietly have put the dish back at full price.
 */

import { enterEditMode } from "../lib/pos-edit-mode";
import { lineKey } from "../lib/pos-cart";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";

const owner = { role: "admin", isOwner: true, permissions: null } as const;

function ringLatte(quantity = 1, note?: string) {
  usePosCartStore.getState().add({
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 100,
    listBasePrice: 100,
    quantity,
    selections: [],
    ...(note ? { note } : {}),
  });
}

beforeEach(() => {
  usePosCartStore.getState().reset();
  useAuthStore.setState({ outletId: null });
});

describe("a kitchen note on a register line", () => {
  it("re-keys the line and keeps its item discount", () => {
    ringLatte(2);
    const key = usePosCartStore.getState().lines[0].key;
    usePosCartStore.getState().setItemDiscount(
      { lineKey: key, units: 1, kind: "percent", value: 50, reason: "Promo" },
      owner,
    );
    expect(usePosCartStore.getState().totals().total).toBe(150);

    usePosCartStore.getState().setLineNote(key, "  less ice ");

    const state = usePosCartStore.getState();
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].note).toBe("less ice");
    expect(state.discount.itemDiscounts?.[0].lineKey).toBe(lineKey("m-latte", [], "less ice"));
    expect(state.totals().total).toBe(150);
  });

  it("clears a note and the discount follows back", () => {
    ringLatte(1, "spicy");
    const key = usePosCartStore.getState().lines[0].key;
    usePosCartStore.getState().setItemDiscount(
      { lineKey: key, units: 1, kind: "fixed", value: 20, reason: "Promo" },
      owner,
    );

    usePosCartStore.getState().setLineNote(key, "");

    const state = usePosCartStore.getState();
    expect(state.lines[0].note).toBeUndefined();
    expect(state.totals().total).toBe(80);
  });

  it("merges into an identical line that already carries the note", () => {
    ringLatte(1, "no sugar");
    ringLatte(2);
    const plain = usePosCartStore.getState().lines.find((line) => !line.note);

    usePosCartStore.getState().setLineNote(plain?.key ?? "", "no sugar");

    const lines = usePosCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(usePosCartStore.getState().totals().subtotal).toBe(300);
  });

  it("ignores a key that is not in the cart", () => {
    ringLatte();
    const before = usePosCartStore.getState().lines;
    usePosCartStore.getState().setLineNote("missing", "x");
    expect(usePosCartStore.getState().lines).toBe(before);
  });

  it("keeps a placed one-dish discount when an edited order's line gets a note", () => {
    const order = {
      _id: "order-1",
      total: 180,
      revisionNumber: 0,
      items: [
        {
          _id: "oi-1",
          orderId: "order-1",
          menuItemId: "m-latte",
          menuItemName: "Latte",
          quantity: 2,
          price: 100,
          subtotal: 200,
          addons: [],
        },
      ],
      discount_data: {
        total: 20,
        deliveryDiscount: 0,
        lines: [
          {
            label: "Discount — Promo",
            amount: 20,
            items: [{ lineKey: "line-0", units: 1, amount: 20 }],
          },
        ],
        allocationsByLine: { "line-0": 20 },
      },
    };
    usePosCartStore.getState().beginEdit(enterEditMode(order, [{ kind: "charge", amount: 180 }], {}));
    const key = usePosCartStore.getState().lines[0].key;
    const before = usePosCartStore.getState().editTotals();

    usePosCartStore.getState().setLineNote(key, "take-out");

    const after = usePosCartStore.getState().editTotals();
    expect(usePosCartStore.getState().lines[0].note).toBe("take-out");
    expect(after?.newTotal).toBe(before?.newTotal);
    expect(after?.isDirty).toBe(true);
  });
});
