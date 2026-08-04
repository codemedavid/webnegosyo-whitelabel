/**
 * The running sale, as the cashier reads it.
 *
 * This component prints the only figure that matters at a counter: the amount
 * on the Charge button, which is what the customer is asked to hand over. It
 * had no test of any kind, because `jest.config.js` could not reach
 * `components/`.
 *
 * Nothing is mocked. The discount lines and totals here are produced by the
 * real engine — `sessionDiscount` and `cartTotals` — from a real cart, so a
 * test cannot pass by agreeing with a hand-written fixture that the shipping
 * code would never have generated.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CartSheet } from "./CartSheet";
import { addLine, cartTotals, type PosCartLine } from "../../lib/pos-cart";
import { sessionDiscount, type PosDiscountSession } from "../../lib/pos-discount-session";
import type { ManualDiscount } from "../../lib/pos-discount";
import type { Voucher } from "../../lib/vouchers/types";

const SERVICE_CHARGE = { type: "percentage", value: 10 } as const;

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

/** ₱300 of coffee: 2 × ₱150. */
function counterSale(): PosCartLine[] {
  return addLine([], {
    menuItemId: "m-latte",
    name: "Latte",
    basePrice: 150,
    quantity: 2,
    selections: [],
  });
}

/**
 * Renders the sheet exactly as `app/(main)/pos.tsx` does: discount lines priced
 * live against the cart, totals taken from the same lines.
 */
function renderSale(session: PosDiscountSession) {
  const lines = counterSale();
  const { serviceCharge } = cartTotals(lines, SERVICE_CHARGE);
  const discountLines = sessionDiscount(session, lines, serviceCharge, new Date(), null).lines;

  render(
    <CartSheet
      lines={lines}
      totals={cartTotals(lines, SERVICE_CHARGE, discountLines)}
      orderTypes={[]}
      orderTypeId={null}
      isExpanded
      onToggle={() => {}}
      onSelectOrderType={() => {}}
      onChangeQty={() => {}}
      onClear={() => {}}
      onCharge={() => {}}
      discountLines={discountLines}
      onAddDiscount={() => {}}
    />,
  );
}

/** The sheet with props under the test's control, for the affordance cases. */
function renderSheet(overrides: Partial<React.ComponentProps<typeof CartSheet>> = {}) {
  const lines = counterSale();
  render(
    <CartSheet
      lines={lines}
      totals={cartTotals(lines, SERVICE_CHARGE)}
      orderTypes={[]}
      orderTypeId={null}
      isExpanded
      onToggle={() => {}}
      onSelectOrderType={() => {}}
      onChangeQty={() => {}}
      onClear={() => {}}
      onCharge={() => {}}
      onAddDiscount={() => {}}
      {...overrides}
    />,
  );
}

const NOTHING_OFF: PosDiscountSession = { vouchers: [], manual: null };

describe("an undiscounted sale", () => {
  beforeEach(() => renderSale(NOTHING_OFF));

  it("charges the full amount", () => {
    // ₱300 of coffee plus the 10% service charge.
    expect(screen.getByText("Charge")).toBeTruthy();
    expect(screen.getByText("₱330.00")).toBeTruthy();
  });

  it("shows no discount row at all — not even a zero one", () => {
    // A "−₱0.00" row reads as a broken discount and invites the cashier to
    // explain something that never happened.
    expect(screen.queryByText("−₱0.00")).toBeNull();
    expect(screen.queryByText(/^−₱/)).toBeNull();
  });
});

describe("a sale with one voucher on it", () => {
  beforeEach(() => renderSale({ vouchers: [voucher({})], manual: null }));

  it("names the voucher on its own row for the right money", () => {
    // Named, not a bare "Discount" figure: the cashier has to be able to tell
    // the customer which code did what.
    expect(screen.getByText("20% off")).toBeTruthy();
    expect(screen.getByText("−₱60.00")).toBeTruthy();
  });

  it("charges net of the discount", () => {
    // ₱300 + ₱30 service − ₱60.
    expect(screen.getByText("₱270.00")).toBeTruthy();
    // The undiscounted figure is nowhere near the Charge button.
    expect(screen.queryByText("₱330.00")).toBeNull();
  });
});

describe("a sale with two discounts on it", () => {
  const HALF_OFF_COFFEE = voucher({
    id: "v-coffee",
    code: "COFFEE50",
    name: "Half-price coffee",
    discountValue: 50,
    scope: "products",
    targetIds: ["m-latte"],
  });
  const DAMAGED: ManualDiscount = { kind: "fixed", value: 25, reason: "chipped mug" };

  beforeEach(() => renderSale({ vouchers: [HALF_OFF_COFFEE], manual: DAMAGED }));

  it("gives each discount its own named row", () => {
    expect(screen.getByText("Half-price coffee")).toBeTruthy();
    expect(screen.getByText("−₱150.00")).toBeTruthy();

    // The manual discount carries its written reason onto the row, which is
    // the whole audit trail a cashier-given discount has.
    expect(screen.getByText("Discount — chipped mug")).toBeTruthy();
    expect(screen.getByText("−₱25.00")).toBeTruthy();
  });

  it("charges net of both", () => {
    // ₱330 − ₱150 − ₱25.
    expect(screen.getByText("₱155.00")).toBeTruthy();
  });
});

/**
 * Finding the discount entry at all.
 *
 * The engine, the sheet and the store were all built and all worked — and a
 * merchant still reported "I added an item and I don't see a damn thing about
 * adding a voucher". They were right: "+ Add discount" rendered only inside the
 * expanded cart, and the cart opens COLLAPSED. A cashier with a customer
 * holding a code had to know to tap the item count first.
 *
 * A feature nobody can find is a feature that does not exist, so the affordance
 * belongs where the cashier already is.
 */
describe("finding the discount entry", () => {
  it("offers a discount without making the cashier expand the cart first", () => {
    renderSheet({ isExpanded: false });

    expect(screen.getByLabelText("Add a discount")).toBeTruthy();
  });

  it("opens the same discount sheet from the collapsed bar", () => {
    const onAddDiscount = jest.fn();
    renderSheet({ isExpanded: false, onAddDiscount });

    fireEvent.press(screen.getByLabelText("Add a discount"));

    expect(onAddDiscount).toHaveBeenCalled();
  });

  it("offers nothing to discount on an empty register", () => {
    renderSheet({ isExpanded: false, lines: [] });

    expect(screen.queryByLabelText("Add a discount")).toBeNull();
  });

  it("hides the affordance when the caller offers no discounting", () => {
    // Kept honest rather than always-on: the caller decides whether this sale
    // may be discounted at all.
    renderSheet({ isExpanded: false, onAddDiscount: undefined });

    expect(screen.queryByLabelText("Add a discount")).toBeNull();
  });

  it("shows an applied discount on the collapsed bar", () => {
    // Otherwise a cashier who collapses the cart sees a total that does not
    // match the items with nothing on screen explaining the difference.
    renderSheet({
      isExpanded: false,
      discountLines: [{ label: "SAVE20", amount: 40, code: "SAVE20", voucherId: "v-1" }],
    });

    expect(screen.getByText(/SAVE20/)).toBeTruthy();
  });
});
