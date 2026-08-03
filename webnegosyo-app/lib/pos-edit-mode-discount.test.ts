import { enterEditMode, editModeTotals, withEditVouchers } from "./pos-edit-mode";
import type { PosCartLine } from "./pos-cart";
import type { Voucher } from "./vouchers/types";

/**
 * Carrying a discount into an edit without double-counting it.
 *
 * `carriedCharges` is the residue of a placed bill: total minus items minus
 * delivery. Before re-pricing existed that residue ABSORBED the discount, which
 * is exactly why a discount survived an edit — it was baked into a number
 * nobody could decompose.
 *
 * Now that the discount is re-priced separately, it has to come OUT of the
 * residue, or the edited order would have it deducted twice: once inside
 * `carriedCharges` and again as a discount line.
 *
 * The existing behaviour for an order with no stored breakdown is unchanged: a
 * negative residue is still preserved, because for those orders it is the only
 * record that a discount happened at all.
 */

const EMPTY_CATALOG = { items: {}, modifiers: {} } as never;

function orderItem() {
  return {
    menuItemId: "m-latte",
    menuItemName: "Latte",
    quantity: 1,
    subtotal: 200,
  };
}

/** ₱200 of food sold for ₱180, with the breakdown recorded. */
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

describe("enterEditMode with a recorded discount", () => {
  it("captures the discount as placed", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);

    expect(context.storedDiscount?.total).toBe(20);
  });

  it("takes the discount out of the carried residue", () => {
    // Otherwise ₱20 comes off twice: once inside carriedCharges, once as a
    // re-priced discount line.
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);

    expect(context.carriedCharges).toBe(0);
  });

  it("still preserves a negative residue when nothing was recorded", () => {
    // For these orders the residue is the only evidence a discount happened.
    const { context } = enterEditMode(
      { _id: "order-3", total: 180, items: [orderItem()] },
      [],
      EMPTY_CATALOG,
    );

    expect(context.carriedCharges).toBe(-20);
    expect(context.storedDiscount).toBeNull();
  });

  it("starts with no vouchers, because they have not been fetched yet", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);

    expect(context.discountVouchers).toBeNull();
  });
});

describe("editModeTotals with a recorded discount", () => {
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

  it("bills the discount once when the voucher still qualifies", () => {
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const withVouchers = withEditVouchers(context, [latteVoucher]);

    const totals = editModeTotals(cartOf("m-latte", 200), withVouchers);

    expect(totals.newTotal).toBe(180);
  });

  it("charges full price once the item the voucher qualified for is gone", () => {
    // The owner's decision, arriving at the number the customer is asked for.
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const withVouchers = withEditVouchers(context, [latteVoucher]);

    const totals = editModeTotals(cartOf("m-cake", 200), withVouchers);

    expect(totals.newTotal).toBe(200);
  });

  it("keeps the discount while the vouchers are still unfetched", () => {
    // The edit screen renders before the lookup returns; showing full price for
    // a moment and then dropping would read as a price that changed itself.
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);

    const totals = editModeTotals(cartOf("m-cake", 200), context);

    expect(totals.newTotal).toBe(180);
  });

  it("asks the customer for the difference once the discount is lost", () => {
    // They paid ₱180. Full price is ₱200, so ₱20 is collectable.
    const { context } = enterEditMode(discountedOrder(), [], EMPTY_CATALOG);
    const priced = withEditVouchers(context, [latteVoucher]);
    const settled = { ...priced, payments: [{ kind: "charge" as const, amount: 180 }] };

    const totals = editModeTotals(cartOf("m-cake", 200), settled);

    expect(totals.balance).toBe(20);
    expect(totals.intent).toBe("collect");
  });
});
