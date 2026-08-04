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
import { render, screen } from "@testing-library/react-native";
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
