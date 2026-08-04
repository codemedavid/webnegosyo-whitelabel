/**
 * Discounting a placed order, driven through the REAL register store.
 *
 * The register could not do this at all: `pos.tsx` passed `onAddDiscount` only
 * when NOT editing, so a customer who produced a voucher after ordering had to
 * have the order cancelled and re-rung.
 *
 * Turning the button on is the easy half. The half that breaks money is the
 * CONTEXT a code is judged in. A counter sale has no delivery fee and its
 * service charge comes from the order type; an edited order has the fee and
 * charges the placed bill carried. Judging an edit against the counter-sale
 * context is the shape that produced the last four money defects here — a
 * free-delivery voucher rejected as `no_delivery_fee` against a ₱50 delivery
 * order, and a discount capped against the wrong bill.
 *
 * So nothing that prices anything is mocked. The cart engine, the voucher
 * engine, the discount session and the edit re-pricer are all shipping code.
 */

import { enterEditMode } from "../lib/pos-edit-mode";
import type { Voucher } from "../lib/vouchers/types";
import { useAuthStore } from "./auth-store";
import { usePosCartStore } from "./pos-cart-store";

const voucher = (overrides: Partial<Voucher>): Voucher => ({
  id: "v-save20",
  code: "SAVE20",
  name: "20% off",
  discountType: "percent",
  discountValue: 20,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
  ...overrides,
});

/** ₱200 of coffee, ₱50 to deliver it. Placed total ₱250. */
function deliveryOrder() {
  return {
    _id: "order-1",
    total: 250,
    revisionNumber: 0,
    deliveryFee: 50,
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
  };
}

function openEdit() {
  const entered = enterEditMode(deliveryOrder(), [{ kind: "charge", amount: 250 }], {});
  usePosCartStore.getState().beginEdit(entered);
}

beforeEach(() => {
  usePosCartStore.getState().reset();
  useAuthStore.setState({ outletId: null });
});

describe("discounting an order being edited", () => {
  it("takes an applied code off the edited order's total", () => {
    openEdit();

    usePosCartStore.getState().applyVoucher(voucher({}));

    // 20% of ₱200 of coffee is ₱40. The ₱50 delivery is not discounted.
    expect(usePosCartStore.getState().editTotals()?.newTotal).toBe(210);
  });

  it("leaves the placed total alone before any code is applied", () => {
    openEdit();

    expect(usePosCartStore.getState().editTotals()?.newTotal).toBe(250);
  });

  it("reports no edit totals when the register is ringing a counter sale", () => {
    expect(usePosCartStore.getState().editTotals()).toBeNull();
  });

  /**
   * The defect this file exists for. The counter-sale context carries no
   * delivery fee, so the engine rejects a free-delivery voucher as
   * `no_delivery_fee` — on an order that plainly has one.
   */
  it("judges a free-delivery code against the ORDER's delivery fee", () => {
    openEdit();

    const verdict = usePosCartStore.getState().checkVoucher(
      voucher({ id: "v-free", code: "FREEDEL", discountType: "free_delivery", discountValue: 0 }),
    );

    expect(verdict.isAccepted).toBe(true);
  });

  it("actually discounts the delivery fee when that code is applied", () => {
    openEdit();

    usePosCartStore.getState().applyVoucher(
      voucher({ id: "v-free", code: "FREEDEL", discountType: "free_delivery", discountValue: 0 }),
    );

    expect(usePosCartStore.getState().editTotals()?.newTotal).toBe(200);
  });

  it("turns a discount on a fully paid order into money owed back", () => {
    openEdit();

    usePosCartStore.getState().applyVoucher(voucher({}));

    const totals = usePosCartStore.getState().editTotals();
    expect(totals?.intent).toBe("refund");
    expect(totals?.balance).toBe(-40);
  });

  /**
   * The shown total and the saved one travel by different routes —
   * `newTotal` to the screen, `carriedChargesForSave` to the revise mutation.
   * If they disagree the customer is billed a figure nobody was shown.
   */
  it("saves the same total it showed", () => {
    openEdit();
    usePosCartStore.getState().applyVoucher(voucher({}));

    const totals = usePosCartStore.getState().editTotals()!;
    // What `reviseOrder` recomputes: items + delivery + serviceChargeAmount.
    expect(200 + 50 + totals.carriedChargesForSave).toBe(totals.newTotal);
  });

  it("clears the applied code when the edit is abandoned", () => {
    openEdit();
    usePosCartStore.getState().applyVoucher(voucher({}));

    usePosCartStore.getState().endEdit();

    expect(usePosCartStore.getState().sessionDiscount().lines).toEqual([]);
  });

  /**
   * A voucher held for an edit must not price itself onto the next customer's
   * counter sale — that is money given to someone who presented no code.
   */
  it("does not carry the code onto the next counter sale", () => {
    openEdit();
    usePosCartStore.getState().applyVoucher(voucher({}));
    usePosCartStore.getState().endEdit();

    usePosCartStore.getState().add({
      menuItemId: "m-bun",
      name: "Bun",
      basePrice: 60,
      quantity: 1,
      selections: [],
    });

    expect(usePosCartStore.getState().totals().total).toBe(60);
  });
});
