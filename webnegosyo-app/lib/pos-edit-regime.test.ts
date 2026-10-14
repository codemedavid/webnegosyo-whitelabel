/**
 * An order placed with the store's own discount (voucher, cashier discount)
 * and edited to add a Senior/PWD claimant: the customer gets the HIGHER of the
 * two, never both (RA 9994 §4) — the same rule a fresh sale follows, with the
 * order's carried discount counted on the store's side.
 */
import { defaultTaxProfile } from "./gov-discount";
import { carriedEditDiscountTotal, editModeTotals, enterEditMode } from "./pos-edit-mode";
import { EMPTY_POS_DISCOUNT_SESSION, appliedGovernment, sessionDiscount } from "./pos-discount-session";
import { storedGovDiscount, toOrderLineKeys, type PosGovContext, type PosGovSession } from "./pos-gov-discount";

const EMPTY_CATALOG = { items: {}, modifiers: {} } as never;
const NOW = new Date("2026-10-15T02:00:00Z");

const CONTEXT: PosGovContext = {
  profile: defaultTaxProfile("vat"),
  excludedMenuItemIds: new Set(),
  allowShared: true,
};

/** A ₱560 sisig placed with the store's own discount of `amount`. */
function placedWithStoreDiscount(amount: number) {
  return {
    _id: "o-1",
    status: "pending",
    total: 560 - amount,
    items: [{ menuItemId: "m-sisig", menuItemName: "Sisig", quantity: 1, price: 560, subtotal: 560 }],
    customerData: {
      discount: {
        total: amount,
        deliveryDiscount: 0,
        lines: [{ label: "Discount — Regular", amount }],
        allocationsByLine: {},
      },
    },
  };
}

/** The store's own steps: price the session, then the edit totals. */
function editAddingSenior(amount: number) {
  const entered = enterEditMode(placedWithStoreDiscount(amount) as never, [], EMPTY_CATALOG);
  const cart = entered.cart;
  const government: PosGovSession = {
    claimants: [
      { id: "c1", kind: "senior", name: "Juan Dela Cruz", idNumber: "12345", allocation: { mode: "items", units: { [cart[0].key]: 1 } } },
    ],
    diners: null,
    approval: null,
    approvalSkippedOffline: false,
  };
  const session = sessionDiscount(
    { ...EMPTY_POS_DISCOUNT_SESSION, government },
    cart,
    0,
    NOW,
    null,
    0,
    CONTEXT,
    carriedEditDiscountTotal(cart, entered.context),
  );
  const pricing = appliedGovernment(session);
  const record = pricing
    ? toOrderLineKeys(
        storedGovDiscount({ session: government, pricing, profile: CONTEXT.profile!, itemsTotal: 560, serviceCharge: 0, deliveryFee: 0 }),
        cart,
      )
    : null;
  return editModeTotals(cart, entered.context, session.lines, record);
}

describe("adding a Senior/PWD claimant while editing an order that already has a store discount", () => {
  it("takes the Senior/PWD discount alone when it is bigger (₱160 vs ₱100)", () => {
    const totals = editAddingSenior(100);

    expect(totals.newTotal).toBe(400);
    expect(totals.settledDiscount?.total).toBe(160);
    expect(totals.settledDiscount?.government).toBeDefined();
    expect(totals.settledDiscount?.lines.some((line) => line.label === "Discount — Regular")).toBe(false);
  });

  it("keeps the store discount alone when it is bigger (₱200 vs ₱160)", () => {
    const totals = editAddingSenior(200);

    expect(totals.newTotal).toBe(360);
    expect(totals.settledDiscount?.total).toBe(200);
    expect(totals.settledDiscount?.government).toBeUndefined();
    expect(totals.settledDiscount?.lines).toEqual([{ label: "Discount — Regular", amount: 200 }]);
  });
});
