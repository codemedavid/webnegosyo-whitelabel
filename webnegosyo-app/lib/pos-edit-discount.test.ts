import { repriceEditDiscount } from "./pos-edit-discount";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * What happens to a discount when a placed order is edited.
 *
 * DECIDED BY THE OWNER: the discount is RE-PRICED. Remove the item a voucher
 * qualified for and the discount goes with it, rather than being carried
 * forward as an amount with no rule behind it.
 *
 * The distinction that makes this safe is WHICH rules get re-checked:
 *
 *  - CART-dependent rules are re-checked. Scope and minimum spend describe the
 *    order, and the order just changed. That is the whole point.
 *  - LIFECYCLE rules are not. A voucher that expired or was retired since the
 *    sale was validly used at the time, and stripping it during an unrelated
 *    edit would re-bill a customer for a discount they were legitimately given.
 *
 * A MANUAL discount is always carried forward: a person decided that amount
 * for a reason, and there is no rule to re-evaluate.
 */

const line = (id: string, subtotal: number, menuItemId: string): PosCartLine =>
  ({
    key: id,
    menuItemId,
    menuItemName: "Item",
    basePrice: subtotal,
    quantity: 1,
    subtotal,
    selections: [],
  }) as unknown as PosCartLine;

const NOW = new Date("2026-08-03T02:00:00Z");

const latteOnly: Voucher = {
  id: "v-1",
  code: "LATTE50",
  name: "₱50 off a latte",
  discountType: "fixed",
  discountValue: 50,
  scope: "products",
  targetIds: ["m-latte"],
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const storedFor = (amount: number, code?: string) => ({
  total: amount,
  deliveryDiscount: 0,
  lines: [
    code
      ? { label: code, amount, voucherId: "v-1", code }
      : { label: "Discount — Damaged item", amount },
  ],
  allocationsByLine: {},
});

describe("repriceEditDiscount", () => {
  it("is nothing when the order carried no discount", () => {
    const result = repriceEditDiscount({
      stored: null,
      vouchers: [],
      cart: [line("a", 200, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("keeps a voucher that still qualifies", () => {
    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [latteOnly],
      cart: [line("a", 200, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
    expect(result.isRepriced).toBe(true);
  });

  it("drops a voucher once the item it qualified for is removed", () => {
    // The decision this whole module exists for.
    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [latteOnly],
      cart: [line("b", 200, "m-cake")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("drops a voucher once the edit falls below its minimum spend", () => {
    const withMinimum: Voucher = { ...latteOnly, minOrderAmount: 300 };

    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [withMinimum],
      cart: [line("a", 100, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
  });

  it("re-prices a percentage against the smaller order", () => {
    const percent: Voucher = {
      ...latteOnly,
      discountType: "percent",
      discountValue: 10,
      scope: "universal",
      targetIds: undefined,
    };

    const result = repriceEditDiscount({
      stored: storedFor(20, "LATTE50"),
      vouchers: [percent],
      cart: [line("a", 100, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(10);
  });

  it("keeps a voucher that has since expired, because it was valid when used", () => {
    // Lifecycle, not cart. Stripping it would re-bill the customer for a
    // discount they were legitimately given.
    const expired: Voucher = { ...latteOnly, endsAt: "2026-01-01T00:00:00Z" };

    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [expired],
      cart: [line("a", 200, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
  });

  it("keeps a voucher the merchant has since retired", () => {
    const retired: Voucher = { ...latteOnly, isActive: false };

    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [retired],
      cart: [line("a", 200, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
  });

  it("keeps a voucher that can no longer be found at all", () => {
    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [],
      cart: [line("a", 200, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
  });

  it("carries the whole discount forward when the vouchers could not be fetched", () => {
    // Offline at the counter. Dropping a discount because the wifi died would
    // charge the customer more than they agreed for a reason they cannot see.
    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: null,
      cart: [line("b", 200, "m-cake")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
    expect(result.isRepriced).toBe(false);
  });

  it("always carries a manual discount forward", () => {
    // A person decided that amount for a reason; there is no rule to re-check.
    const result = repriceEditDiscount({
      stored: storedFor(50),
      vouchers: [latteOnly],
      cart: [line("b", 200, "m-cake")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(50);
    expect(result.lines[0].label).toContain("Damaged item");
  });

  it("never discounts more than the edited order is worth", () => {
    const result = repriceEditDiscount({
      stored: storedFor(500),
      vouchers: [],
      cart: [line("a", 100, "m-latte")],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(100);
  });

  it("is nothing when the edit empties the cart", () => {
    const result = repriceEditDiscount({
      stored: storedFor(50, "LATTE50"),
      vouchers: [latteOnly],
      cart: [],
      serviceCharge: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
  });
});
