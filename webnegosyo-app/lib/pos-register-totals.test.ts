/**
 * The register's displayed money, selected from the cart store's INPUTS.
 *
 * The screen used to memoise `usePosCartStore.getState().totals()` under a
 * suppressed exhaustive-deps, with the dependency list hand-maintained. Every
 * input the store's own arithmetic reads is now an explicit argument, so a
 * value that changes the bill cannot be left out of the list by accident.
 *
 * The two cases that motivated it: a voucher held on the session, and the
 * vouchers behind an edited order's discount, which arrive AFTER the register
 * has been navigated to (`setEditVouchers`) and must change the shown total.
 */
import { EMPTY_POS_DISCOUNT_SESSION, addSessionVoucher } from "./pos-discount-session";
import { enterEditMode, withEditVouchers } from "./pos-edit-mode";
import { selectRegisterMoney, type RegisterMoneyInputs } from "./pos-register-totals";
import { usePosCartStore } from "../stores/pos-cart-store";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

const NOW = new Date("2026-08-03T02:00:00Z");

const line = (key: string, subtotal: number, menuItemId: string): PosCartLine =>
  ({
    key,
    menuItemId,
    name: "Item",
    basePrice: subtotal,
    quantity: 1,
    unitPrice: subtotal,
    subtotal,
    selections: [],
  }) as PosCartLine;

const tenOff: Voucher = {
  id: "v-ten",
  code: "TENOFF",
  name: "₱10 off",
  discountType: "fixed",
  discountValue: 10,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const tenPercent: Voucher = {
  id: "v-tenpct",
  code: "TENPCT",
  name: "10% off",
  discountType: "percent",
  discountValue: 10,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const counterSale: RegisterMoneyInputs = {
  lines: [line("a", 100, "m-1")],
  serviceCharge: undefined,
  discount: EMPTY_POS_DISCOUNT_SESSION,
  delivery: { fee: null, address: "", phone: "" },
  editContext: null,
  outletId: null,
  now: NOW,
};

describe("selectRegisterMoney", () => {
  it("prices a plain counter sale", () => {
    const money = selectRegisterMoney(counterSale);

    expect(money.totals.total).toBe(100);
    expect(money.discountLines).toEqual([]);
    expect(money.edit).toBeNull();
  });

  it("a voucher applied after the sale began changes the displayed total", () => {
    const before = selectRegisterMoney(counterSale);
    const after = selectRegisterMoney({
      ...counterSale,
      discount: addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, tenOff),
    });

    expect(before.totals.total).toBe(100);
    expect(after.totals.total).toBe(90);
    expect(after.discountLines.map((l) => l.code)).toEqual(["TENOFF"]);
  });

  it("a delivery fee attached mid-sale is part of the bill", () => {
    const money = selectRegisterMoney({
      ...counterSale,
      delivery: { fee: 50, address: "Somewhere", phone: "" },
    });

    expect(money.totals.deliveryFee).toBe(50);
    expect(money.totals.total).toBe(150);
  });

  it("the vouchers behind an edited order, set after navigation, change the edit's total", () => {
    // ₱500 of pasta sold for ₱450 online. The cashier opens it on the register;
    // the vouchers behind that ₱50 are looked up and attached a beat later.
    const { cart, context } = enterEditMode(
      {
        _id: "order-1",
        total: 450,
        revisionNumber: 0,
        items: [
          { menuItemId: "m-carbonara", menuItemName: "Carbonara", quantity: 1, subtotal: 500 },
        ],
        customerData: {
          discount: {
            total: 50,
            deliveryDiscount: 0,
            lines: [{ label: "TENPCT", amount: 50, voucherId: "v-tenpct", code: "TENPCT" }],
            allocationsByLine: {},
          },
        },
      },
      [],
      {} as never,
    );

    // Meanwhile the cashier rings a second ₱500 pasta onto the order.
    const edited = [...cart, line("b", 500, "m-lasagna")];

    const beforeVouchers = selectRegisterMoney({
      ...counterSale,
      lines: edited,
      editContext: withEditVouchers(context, null),
    });
    const afterVouchers = selectRegisterMoney({
      ...counterSale,
      lines: edited,
      editContext: withEditVouchers(context, [tenPercent]),
    });

    // Until the lookup lands the ₱50 as placed is carried: ₱1,000 − ₱50.
    expect(beforeVouchers.edit?.newTotal).toBe(950);
    // Once the voucher is known it is re-priced against the edited cart: 10% of ₱1,000.
    expect(afterVouchers.edit?.newTotal).toBe(900);
  });

  it("agrees with the store's own totals for the same state", () => {
    // The store stays the writer; this selector must never price a sale
    // differently from what `pos-tender` will charge through the store.
    const store = usePosCartStore.getState();
    store.reset();
    store.add({ menuItemId: "m-1", name: "Latte", basePrice: 120, quantity: 2, selections: [] });
    store.setOrderType("t1", "Dine in", { type: "percentage", value: 10 });
    store.applyVoucher(tenOff);
    store.setDelivery({ fee: 40 });

    const state = usePosCartStore.getState();
    const money = selectRegisterMoney({
      lines: state.lines,
      serviceCharge: state.serviceCharge,
      discount: state.discount,
      delivery: state.delivery,
      editContext: state.editContext,
      outletId: null,
      now: new Date(),
    });

    expect(money.totals).toEqual(state.totals());
    expect(money.discountLines).toEqual(state.sessionDiscount().lines);
    store.reset();
  });
});
