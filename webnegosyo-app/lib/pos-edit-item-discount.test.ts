/**
 * Editing an order whose discount sits on ONE dish (a cashier's item discount,
 * or a unit-limited voucher whose units were chosen). The order stores each
 * dish by POSITION (`line-<index>`), so an edit that removes an earlier dish
 * shifts every later one — the discount has to follow its dish, not its old
 * position.
 */
import { editModeTotals, enterEditMode, type OrderEditContext } from "./pos-edit-mode";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

const EMPTY_CATALOG = { items: {}, modifiers: {} } as never;

const FRIES = { menuItemId: "m-fries", menuItemName: "Fries", quantity: 5, price: 112, subtotal: 560 };
const BURGER = { menuItemId: "m-burger", menuItemName: "Burger", quantity: 2, price: 150, subtotal: 300 };

const oneItem: Voucher = {
  id: "v-one",
  code: "ONEHALF",
  name: "Half off one item",
  discountType: "percent",
  discountValue: 50,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos"],
  isActive: true,
  maxDiscountedUnits: 1,
};

function placedWith(total: number, discount: Record<string, unknown>) {
  return { _id: "o-1", status: "pending", total, items: [FRIES, BURGER], customerData: { discount } };
}

function open(order: ReturnType<typeof placedWith>, vouchers: Voucher[] | null = null) {
  const entered = enterEditMode(order as never, [], EMPTY_CATALOG);
  const context: OrderEditContext = { ...entered.context, discountVouchers: vouchers };
  return { cart: entered.cart, context };
}

const without = (cart: readonly PosCartLine[], menuItemId: string) =>
  cart.filter((line) => line.menuItemId !== menuItemId);

const withQuantity = (cart: readonly PosCartLine[], menuItemId: string, quantity: number) =>
  cart.map((line) =>
    line.menuItemId === menuItemId
      ? { ...line, quantity, subtotal: Math.round((line.subtotal / line.quantity) * quantity * 100) / 100 }
      : line,
  );

describe("editing an order with a cashier's item discount", () => {
  // ₱20 off ONE of the two burgers, which sit second on the order.
  const burgerDiscount = placedWith(840, {
    total: 20,
    deliveryDiscount: 0,
    lines: [{ label: "Discount — Cold", amount: 20, items: [{ lineKey: "line-1", units: 1, amount: 20 }] }],
    allocationsByLine: { "line-1": 20 },
  });

  it("follows the burger to its new position when the fries are removed", () => {
    const { cart, context } = open(burgerDiscount);
    const totals = editModeTotals(without(cart, "m-fries"), context);

    expect(totals.newTotal).toBe(280);
    expect(totals.settledDiscount?.lines).toEqual([
      { label: "Discount — Cold", amount: 20, items: [{ lineKey: "line-0", units: 1, amount: 20 }] },
    ]);
    expect(totals.settledDiscount?.allocationsByLine).toEqual({ "line-0": 20 });
  });

  it("goes with its dish when that dish is removed, and the bill is re-priced", () => {
    const friesDiscount = placedWith(804, {
      total: 56,
      deliveryDiscount: 0,
      lines: [{ label: "Discount — Damaged", amount: 56, items: [{ lineKey: "line-0", units: 1, amount: 56 }] }],
      allocationsByLine: { "line-0": 56 },
    });
    const { cart, context } = open(friesDiscount);
    const totals = editModeTotals(without(cart, "m-fries"), context);

    expect(totals.newTotal).toBe(300);
    expect(totals.settledDiscount).toBeNull();
  });

  it("shrinks to the units left when the dish's quantity drops", () => {
    const twoBurgers = placedWith(820, {
      total: 40,
      deliveryDiscount: 0,
      lines: [{ label: "Discount — Cold", amount: 40, items: [{ lineKey: "line-1", units: 2, amount: 40 }] }],
      allocationsByLine: { "line-1": 40 },
    });
    const { cart, context } = open(twoBurgers);
    const totals = editModeTotals(withQuantity(cart, "m-burger", 1), context);

    expect(totals.newTotal).toBe(690);
    expect(totals.settledDiscount?.lines).toEqual([
      { label: "Discount — Cold", amount: 20, items: [{ lineKey: "line-1", units: 1, amount: 20 }] },
    ]);
    expect(totals.settledDiscount?.allocationsByLine).toEqual({ "line-1": 20 });
  });

  it("leaves a whole-order discount exactly as placed", () => {
    const wholeOrder = placedWith(760, {
      total: 100,
      deliveryDiscount: 0,
      lines: [{ label: "Discount — Regular", amount: 100 }],
      allocationsByLine: {},
    });
    const { cart, context } = open(wholeOrder);
    const totals = editModeTotals(without(cart, "m-fries"), context);

    expect(totals.newTotal).toBe(200);
    expect(totals.settledDiscount?.lines).toEqual([{ label: "Discount — Regular", amount: 100 }]);
  });
});

describe("editing an order with a unit-limited voucher whose dish was chosen", () => {
  // ONEHALF would land on the cheapest unit (a ₱112 fries → ₱56), but the
  // cashier chose a burger (₱150 → ₱75).
  const pickedBurger = placedWith(785, {
    total: 75,
    deliveryDiscount: 0,
    lines: [
      {
        label: "Half off one item",
        amount: 75,
        code: "ONEHALF",
        voucherId: "v-one",
        items: [{ lineKey: "line-1", units: 1, amount: 75 }],
      },
    ],
    allocationsByLine: { "line-1": 75 },
  });

  it("keeps the chosen dish when nothing changed", () => {
    const { cart, context } = open(pickedBurger, [oneItem]);
    const totals = editModeTotals(cart, context);

    expect(totals.newTotal).toBe(785);
    expect(totals.settledDiscount?.lines[0].items).toEqual([{ lineKey: "line-1", units: 1, amount: 75 }]);
  });

  it("keeps the chosen dish at its new position when an earlier dish is removed", () => {
    const { cart, context } = open(pickedBurger, [oneItem]);
    const totals = editModeTotals(without(cart, "m-fries"), context);

    expect(totals.newTotal).toBe(225);
    expect(totals.settledDiscount?.lines[0].items).toEqual([{ lineKey: "line-0", units: 1, amount: 75 }]);
    expect(totals.settledDiscount?.allocationsByLine).toEqual({ "line-0": 75 });
  });

  it("falls back to the cheapest unit when the chosen dish is removed", () => {
    const { cart, context } = open(pickedBurger, [oneItem]);
    const totals = editModeTotals(without(cart, "m-burger"), context);

    expect(totals.newTotal).toBe(504);
    expect(totals.settledDiscount?.lines[0].items).toEqual([{ lineKey: "line-0", units: 1, amount: 56 }]);
  });
});
