import { readFileSync } from "fs";
import { join } from "path";
import { enterEditMode, editModeTotals, withEditVouchers } from "./pos-edit-mode";
import { revisedOrderTotal, type PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * The number the register SAVES must be the number it SHOWED.
 *
 * `reviseOrder` has exactly one argument for everything that is neither line
 * items nor delivery: `serviceChargeAmount`. The tender screen was passing
 * `editContext.carriedCharges` straight into it, which was correct only while
 * that residue still absorbed the discount.
 *
 * Once the discount was pulled OUT of the residue so it could be re-priced,
 * that argument stopped describing the bill: the screen subtracted the
 * re-priced discount and the save did not. A discounted order edited and saved
 * would have been re-billed at full price — the customer charged back the
 * discount they were given, silently.
 *
 * The money-wiring guardrail cannot catch this. `order-revise.ts` does call
 * `revisedOrderTotal`, which is an approved owner of the arithmetic; the defect
 * is in the ARGUMENT handed to it. So this file checks the seam directly.
 */

const EMPTY_CATALOG = { items: {}, modifiers: {} } as never;

function orderItem() {
  return { menuItemId: "m-latte", menuItemName: "Latte", quantity: 1, subtotal: 200 };
}

/** ₱200 of food sold for ₱180, breakdown recorded. */
function discountedOrder() {
  return {
    _id: "order-9",
    total: 180,
    revisionNumber: 0,
    items: [orderItem()],
    customerData: {
      discount: {
        total: 20,
        deliveryDiscount: 0,
        lines: [{ label: "LATTE20", amount: 20, voucherId: "v-1", code: "LATTE20" }],
        allocationsByLine: {},
      },
    },
  };
}

const latteVoucher: Voucher = {
  id: "v-1",
  code: "LATTE20",
  name: "₱20 off a latte",
  discountType: "fixed",
  discountValue: 20,
  scope: "products",
  targetIds: ["m-latte"],
  isStackable: true,
  usedCount: 0,
  channels: ["pos", "checkout"],
  isActive: true,
};

const cartOf = (menuItemId: string, subtotal: number): PosCartLine[] => [
  {
    key: "k1",
    menuItemId,
    menuItemName: "Item",
    basePrice: subtotal,
    quantity: 1,
    subtotal,
    selections: [],
  } as unknown as PosCartLine,
];

describe("the charge the register saves", () => {
  it("reproduces the shown total when the discount still applies", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const priced = withEditVouchers(context, [latteVoucher]);
    const cart = cartOf("m-latte", 200);

    const totals = editModeTotals(cart, priced);

    // Exactly what the revise mutation will recompute on the other side.
    expect(revisedOrderTotal(200, priced.deliveryFee, totals.carriedChargesForSave)).toBe(
      totals.newTotal,
    );
  });

  it("reproduces the shown total once the discount is lost", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const priced = withEditVouchers(context, [latteVoucher]);
    const cart = cartOf("m-cake", 200);

    const totals = editModeTotals(cart, priced);

    expect(totals.newTotal).toBe(200);
    expect(revisedOrderTotal(200, priced.deliveryFee, totals.carriedChargesForSave)).toBe(
      200,
    );
  });

  it("reproduces the shown total while the vouchers are still unfetched", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const cart = cartOf("m-latte", 200);

    const totals = editModeTotals(cart, context);

    expect(revisedOrderTotal(200, context.deliveryFee, totals.carriedChargesForSave)).toBe(
      totals.newTotal,
    );
  });

  it("is unchanged for an order that carried no recorded discount", () => {
    const { context } = enterEditMode(
      { _id: "order-2", total: 210, revisionNumber: 0, items: [orderItem()] },
      [],
      EMPTY_CATALOG,
    );

    const totals = editModeTotals(cartOf("m-latte", 200), context);

    expect(totals.carriedChargesForSave).toBe(context.carriedCharges);
  });
});

describe("the tender screen", () => {
  it("never saves the raw carried residue", () => {
    // That residue no longer describes the bill on its own — the re-priced
    // discount has to be folded in first.
    const source = readFileSync(
      join(process.cwd(), "app/(main)/pos-tender.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/serviceChargeAmount:\s*editContext\.carriedCharges/);
  });

  it("saves the figure the totals derived", () => {
    const source = readFileSync(
      join(process.cwd(), "app/(main)/pos-tender.tsx"),
      "utf8",
    );

    expect(source).toMatch(/serviceChargeAmount:\s*\w*[Tt]otals\.carriedChargesForSave/);
  });
});
