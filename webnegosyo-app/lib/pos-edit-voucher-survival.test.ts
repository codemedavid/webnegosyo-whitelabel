import { repriceEditDiscount } from "./pos-edit-discount";
import { editModeTotals, enterEditMode, withEditVouchers } from "./pos-edit-mode";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * A storefront discount must survive the cashier opening the order.
 *
 * Re-pricing an edit runs the placed vouchers against the register's view of
 * the cart. That view is built for a COUNTER SALE: no delivery, and no category
 * on any line. Handing it to the engine unchanged makes two kinds of voucher
 * look like they no longer fit an order they still fit perfectly —
 * `no_delivery_fee` for a free-delivery voucher, `no_matching_items` for a
 * category-scoped one — and both of those reasons DROP the line.
 *
 * The customer is then re-billed a discount they were given. These are the two
 * shapes of that bug, priced end to end.
 */

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

/** 20% off everything in the Pasta CATEGORY. */
const pastaCategory: Voucher = {
  id: "v-pasta",
  code: "PASTA20",
  name: "20% off pasta",
  discountType: "percent",
  discountValue: 20,
  scope: "categories",
  targetIds: ["cat-pasta"],
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const freeDelivery: Voucher = {
  id: "v-freedel",
  code: "FREEDEL",
  name: "Free delivery",
  discountType: "free_delivery",
  discountValue: 0,
  scope: "universal",
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const stored = (voucher: Voucher, amount: number) => ({
  total: amount,
  deliveryDiscount: voucher.discountType === "free_delivery" ? amount : 0,
  lines: [{ label: voucher.code, amount, voucherId: voucher.id, code: voucher.code }],
  allocationsByLine: {},
});

const EMPTY_CATALOG = {} as never;

describe("a category-scoped voucher on an edited order", () => {
  it("survives the re-price even though the register has no category on a line", () => {
    // ₱500 of pasta sold for ₱400. The cashier opens the order to add a drink.
    const result = repriceEditDiscount({
      stored: stored(pastaCategory, 100),
      vouchers: [pastaCategory],
      cart: [line("a", 500, "m-carbonara")],
      serviceCharge: 0,
      deliveryFee: 0,
      now: NOW,
    });

    expect(result.total).toBe(100);
  });

  it("does not re-bill the customer the discount on the was/now header", () => {
    const { cart, context } = enterEditMode(
      {
        _id: "order-1",
        total: 400,
        revisionNumber: 0,
        items: [
          {
            menuItemId: "m-carbonara",
            menuItemName: "Carbonara",
            quantity: 1,
            subtotal: 500,
          },
        ],
        customerData: {
          discount: {
            total: 100,
            deliveryDiscount: 0,
            lines: [
              { label: "PASTA20", amount: 100, voucherId: "v-pasta", code: "PASTA20" },
            ],
            allocationsByLine: {},
          },
        },
      },
      [],
      EMPTY_CATALOG,
    );

    const totals = editModeTotals(cart, withEditVouchers(context, [pastaCategory]));

    expect(totals.newTotal).toBe(400);
    expect(totals.carriedChargesForSave).toBe(-100);
  });
});

describe("a free-delivery voucher on an edited order", () => {
  it("survives the re-price because the edit knows the real delivery fee", () => {
    const result = repriceEditDiscount({
      stored: stored(freeDelivery, 60),
      vouchers: [freeDelivery],
      cart: [line("a", 500, "m-carbonara")],
      // What `editModeTotals` passes: the placed residue plus delivery.
      serviceCharge: 60,
      deliveryFee: 60,
      now: NOW,
    });

    expect(result.total).toBe(60);
  });

  it("does not re-charge the delivery the customer was given free", () => {
    const { cart, context } = enterEditMode(
      {
        _id: "order-2",
        total: 500,
        revisionNumber: 0,
        deliveryFee: 60,
        items: [
          {
            menuItemId: "m-carbonara",
            menuItemName: "Carbonara",
            quantity: 1,
            subtotal: 500,
          },
        ],
        customerData: {
          discount: {
            total: 60,
            deliveryDiscount: 60,
            lines: [
              { label: "FREEDEL", amount: 60, voucherId: "v-freedel", code: "FREEDEL" },
            ],
            allocationsByLine: {},
          },
        },
      },
      [],
      EMPTY_CATALOG,
    );

    const totals = editModeTotals(cart, withEditVouchers(context, [freeDelivery]));

    expect(totals.newTotal).toBe(500);
    expect(totals.carriedChargesForSave).toBe(-60);
  });
});

describe("what the register can still judge for itself", () => {
  it("still drops a PRODUCT-scoped voucher whose item was removed", () => {
    // Menu item ids ARE on every register line, so this rejection is a real
    // verdict rather than the register being blind.
    const productScoped: Voucher = {
      ...pastaCategory,
      scope: "products",
      targetIds: ["m-carbonara"],
    };

    const result = repriceEditDiscount({
      stored: stored(productScoped, 100),
      vouchers: [productScoped],
      cart: [line("b", 500, "m-cake")],
      serviceCharge: 0,
      deliveryFee: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
  });

  it("still drops a category voucher once the edit falls below its minimum", () => {
    const withMinimum: Voucher = { ...pastaCategory, minOrderAmount: 800 };

    const result = repriceEditDiscount({
      stored: stored(withMinimum, 100),
      vouchers: [withMinimum],
      cart: [line("a", 500, "m-carbonara")],
      serviceCharge: 0,
      deliveryFee: 0,
      now: NOW,
    });

    expect(result.total).toBe(0);
  });
});
