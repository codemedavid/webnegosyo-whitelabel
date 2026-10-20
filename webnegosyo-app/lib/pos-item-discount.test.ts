/**
 * Discounts on ONE item at the register: a cashier's item discount ("1 of 5
 * fries, damaged"), and a unit-limited voucher whose units the cashier chose.
 */
import {
  EMPTY_POS_DISCOUNT_SESSION,
  addSessionVoucher,
  discountAfterCartChange,
  removeSessionItemDiscount,
  sessionDiscount,
  setSessionItemDiscount,
  setSessionManualDiscount,
  setSessionUnitPicks,
  voucherUnitChoices,
} from "./pos-discount-session";
import { validateManualItemDiscount, type ManualItemDiscount } from "./pos-discount";
import { buildPosOrder } from "./pos-order";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

const line = (key: string, name: string, quantity: number, subtotal: number, menuItemId = key): PosCartLine =>
  ({
    key,
    menuItemId,
    menuItemName: name,
    name,
    basePrice: subtotal / quantity,
    unitPrice: subtotal / quantity,
    quantity,
    subtotal,
    selections: [],
  }) as unknown as PosCartLine;

const NOW = new Date("2026-10-15T02:00:00Z");
const fries = line("k-fries", "Fries", 5, 560, "m-fries");
const burger = line("k-burger", "Burger", 2, 300, "m-burger");
const cart = [fries, burger];

const owner = { role: "admin", isOwner: true, permissions: null };
const cashierWithoutDiscounts = { role: "admin", isOwner: false, permissions: ["pos"] };

const damaged: ManualItemDiscount = { lineKey: "k-fries", units: 1, kind: "percent", value: 50, reason: "Damaged" };

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

const price = (session = EMPTY_POS_DISCOUNT_SESSION, items = cart) => sessionDiscount(session, items, 0, NOW);

describe("item discount at the register", () => {
  it("takes 50% off ONE fries of five", () => {
    const session = setSessionItemDiscount(EMPTY_POS_DISCOUNT_SESSION, damaged, owner);
    const result = price(session);

    expect(result.total).toBe(56);
    expect(result.lines).toEqual([
      { label: "Discount — Damaged", amount: 56, items: [{ lineKey: "k-fries", units: 1, amount: 56 }] },
    ]);
  });

  it("takes a peso amount off EACH chosen unit, never more than the unit", () => {
    const session = setSessionItemDiscount(
      EMPTY_POS_DISCOUNT_SESSION,
      { ...damaged, units: 2, kind: "fixed", value: 200 },
      owner,
    );

    expect(price(session).total).toBe(224);
  });

  it("needs the vouchers permission and a reason", () => {
    expect(validateManualItemDiscount(damaged, cashierWithoutDiscounts as never).isAllowed).toBe(false);
    expect(validateManualItemDiscount({ ...damaged, reason: " " }, owner as never).isAllowed).toBe(false);
    expect(validateManualItemDiscount({ ...damaged, units: 0 }, owner as never).isAllowed).toBe(false);
    expect(validateManualItemDiscount({ ...damaged, value: 150 }, owner as never).isAllowed).toBe(false);
    expect(setSessionItemDiscount(EMPTY_POS_DISCOUNT_SESSION, damaged, cashierWithoutDiscounts as never).itemDiscounts ?? []).toEqual([]);
  });

  it("keeps one discount per line — a second replaces the first", () => {
    const first = setSessionItemDiscount(EMPTY_POS_DISCOUNT_SESSION, damaged, owner);
    const second = setSessionItemDiscount(first, { ...damaged, units: 2 }, owner);

    expect(second.itemDiscounts).toHaveLength(1);
    expect(price(second).total).toBe(112);
    expect(removeSessionItemDiscount(second, "k-fries").itemDiscounts).toEqual([]);
  });

  it("shrinks to the units left when the line shrinks, and goes with the line", () => {
    const session = setSessionItemDiscount(EMPTY_POS_DISCOUNT_SESSION, { ...damaged, units: 3 }, owner);
    const fewer = [line("k-fries", "Fries", 2, 224, "m-fries"), burger];

    expect(price(session, fewer).total).toBe(112);
    expect(discountAfterCartChange(session, [burger]).itemDiscounts).toEqual([]);
  });

  it("stacks after vouchers and before the whole-order discount, per unit", () => {
    let session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, { ...oneItem, discountValue: 100 });
    session = setSessionUnitPicks(session, "ONEHALF", { "k-fries": 1 });
    session = setSessionItemDiscount(session, { ...damaged, value: 100 }, owner);
    session = setSessionManualDiscount(session, { kind: "fixed", value: 1000, reason: "Staff meal" }, owner as never);
    const result = price(session);

    // Voucher: one whole fries (₱112). Item discount: 100% of the next fries
    // (₱112) — never the same fries twice. Order discount: the rest (₱636).
    expect(result.lines.map((entry) => entry.amount)).toEqual([112, 112, 636]);
    expect(result.total).toBe(860);
  });
});

describe("choosing which item a unit-limited voucher hits", () => {
  it("defaults to the cheapest unit", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, oneItem);

    expect(price(session).lines[0].items).toEqual([{ lineKey: "k-fries", units: 1, amount: 56 }]);
  });

  it("moves to the dish the cashier picked", () => {
    const session = setSessionUnitPicks(addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, oneItem), "onehalf", {
      "k-burger": 1,
    });

    expect(price(session).lines[0]).toMatchObject({ amount: 75, items: [{ lineKey: "k-burger", units: 1, amount: 75 }] });
  });

  it("lists the eligible dishes and the limit for the picker", () => {
    const session = addSessionVoucher(EMPTY_POS_DISCOUNT_SESSION, oneItem);

    expect(voucherUnitChoices(session, cart, 0, NOW)).toEqual([
      {
        code: "ONEHALF",
        name: "Half off one item",
        limit: 1,
        lines: [
          { lineKey: "k-fries", name: "Fries", quantity: 5, chosen: 1 },
          { lineKey: "k-burger", name: "Burger", quantity: 2, chosen: 0 },
        ],
      },
    ]);
  });
});

describe("the stored order", () => {
  it("records each line-specific discount against its order line", () => {
    const session = setSessionItemDiscount(EMPTY_POS_DISCOUNT_SESSION, damaged, owner);
    const { lines } = price(session);
    const args = buildPosOrder({ cart, tender: null, clientOrderId: "c-1", serviceCharge: { type: "fixed", value: 0 }, discounts: lines } as never);
    const discount = (args.customerData as unknown as { discount: { lines: unknown[]; allocationsByLine: unknown } }).discount;

    expect(discount.lines).toEqual([
      { label: "Discount — Damaged", amount: 56, items: [{ lineKey: "line-0", units: 1, amount: 56 }] },
    ]);
    expect(discount.allocationsByLine).toEqual({ "line-0": 56 });
  });
});

describe("editing an order with an item discount", () => {
  it("keeps the dish on the revision and its share on that line", async () => {
    const { editModeTotals, enterEditMode } = await import("./pos-edit-mode");
    const placed = {
      _id: "o-1",
      status: "pending",
      total: 804,
      items: [
        { menuItemId: "m-fries", menuItemName: "Fries", quantity: 5, price: 112, subtotal: 560 },
        { menuItemId: "m-burger", menuItemName: "Burger", quantity: 2, price: 150, subtotal: 300 },
      ],
      customerData: {
        discount: {
          total: 56,
          deliveryDiscount: 0,
          lines: [{ label: "Discount — Damaged", amount: 56, items: [{ lineKey: "line-0", units: 1, amount: 56 }] }],
          allocationsByLine: { "line-0": 56 },
        },
      },
    };
    const entered = enterEditMode(placed as never, [], { items: {}, modifiers: {} } as never);
    const totals = editModeTotals(entered.cart, entered.context);

    expect(totals.newTotal).toBe(804);
    expect(totals.settledDiscount?.lines).toEqual([
      { label: "Discount — Damaged", amount: 56, items: [{ lineKey: "line-0", units: 1, amount: 56 }] },
    ]);
    expect(totals.settledDiscount?.allocationsByLine).toEqual({ "line-0": 56 });
  });
});
