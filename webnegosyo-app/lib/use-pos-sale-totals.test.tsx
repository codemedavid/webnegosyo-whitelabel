/**
 * The register's money, as the two screens that show it read it.
 *
 * The tender screen is a hidden TAB: it mounts once per launch and stays
 * mounted. Its total was a `useMemo` keyed on `[lines, serviceCharge,
 * delivery]` — the discount was missing. From the second sale of a launch on,
 * a voucher applied after the last item was rung changed nothing the memo
 * watched, so the cashier saw the voucher on the cart and then the FULL price
 * on "Amount due", collected it, and handed back change computed from it.
 *
 * These drive the REAL store and the REAL engine through a mounted hook, so a
 * pricing input that stops being watched fails here rather than at a counter.
 */

import { act, renderHook } from "@testing-library/react-native";
import { usePosCartStore } from "../stores/pos-cart-store";
import { useAuthStore } from "../stores/auth-store";
import type { Voucher } from "./vouchers/types";
import { usePosSaleTotals } from "./use-pos-sale-totals";
import { computeChange } from "./pos-cash";
import { buildPosOrder } from "./pos-order";
import { posReceiptOrder } from "./pos-receipt";
import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  renderReceipt,
  stripReceiptMarkup,
} from "./receipt-layout";

const LATTE = {
  menuItemId: "m-latte",
  name: "Latte",
  basePrice: 150,
  quantity: 2,
  selections: [],
};

const SAVE20: Voucher = {
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
};

beforeEach(() => {
  useAuthStore.setState({ outletId: null });
  usePosCartStore.getState().reset();
  usePosCartStore.setState({ serviceCharge: undefined });
});

it("re-prices the amount due when a voucher is applied after the last item", () => {
  // Arrange — the screen is already mounted before the sale starts, exactly
  // like the tender tab from the second sale of a launch onwards.
  const { result } = renderHook(() => usePosSaleTotals());
  act(() => usePosCartStore.getState().add(LATTE));
  expect(result.current.totals.total).toBe(300);

  // Act — the voucher changes no line.
  act(() => usePosCartStore.getState().applyVoucher(SAVE20));

  // Assert
  expect(result.current.totals.discountTotal).toBe(60);
  expect(result.current.totals.total).toBe(240);
  expect(result.current.discountLines.map((line) => line.code)).toEqual(["SAVE20"]);
});

it("returns to full price when the voucher is removed", () => {
  const { result } = renderHook(() => usePosSaleTotals());
  act(() => {
    usePosCartStore.getState().add(LATTE);
    usePosCartStore.getState().applyVoucher(SAVE20);
  });
  expect(result.current.totals.total).toBe(240);

  act(() => usePosCartStore.getState().removeVoucher("SAVE20"));

  expect(result.current.totals.total).toBe(300);
  expect(result.current.discountLines).toEqual([]);
});

it("re-prices when a manual discount is given", () => {
  const { result } = renderHook(() => usePosSaleTotals());
  act(() => usePosCartStore.getState().add(LATTE));

  act(() =>
    usePosCartStore
      .getState()
      .setManualDiscount(
        { kind: "fixed", value: 50, reason: "Senior citizen" },
        { role: "admin", isOwner: true, permissions: null },
      ),
  );

  expect(result.current.totals.total).toBe(250);
});

it("agrees with the figure the sale is written with", () => {
  const { result } = renderHook(() => usePosSaleTotals());
  act(() => {
    usePosCartStore.getState().add(LATTE);
    usePosCartStore.getState().applyVoucher(SAVE20);
  });

  // What tender reads at the swipe — the shown figure must be that one.
  expect(result.current.totals).toEqual(usePosCartStore.getState().totals());
});

describe.each([
  ["modern", MODERN_RECEIPT_LAYOUT],
  ["classic", CLASSIC_RECEIPT_LAYOUT],
  ["compact", COMPACT_RECEIPT_LAYOUT],
  ["detailed", DETAILED_RECEIPT_LAYOUT],
])("the %s receipt for a voucher sale", (_name, layout) => {
  it("names the voucher and prints the discounted total and change", () => {
    // Arrange — the tender tab is mounted before the sale, as in production.
    const { result } = renderHook(() => usePosSaleTotals());
    act(() => {
      usePosCartStore.getState().add(LATTE);
      usePosCartStore.getState().applyVoucher(SAVE20);
    });
    const amountDue = result.current.totals.total;
    const change = computeChange(amountDue, 500);

    // Act — what the swipe does: price at tender, write, print.
    const tender = {
      methodName: "Cash",
      isCash: true,
      cashTendered: 500,
      changeDue: change.changeDue,
    };
    const args = buildPosOrder({
      cart: usePosCartStore.getState().lines,
      tender,
      clientOrderId: "c1",
      discounts: usePosCartStore.getState().sessionDiscount().lines,
    });
    const printed = stripReceiptMarkup(
      renderReceipt(posReceiptOrder("o1", args, tender), { storeName: "Shop" }, layout),
    );

    // Assert — the bill, the screen and the paper agree.
    expect(args.total).toBe(240);
    expect(amountDue).toBe(args.total);
    expect(change.changeDue).toBe(260);
    expect(printed).toContain("20% off");
    expect(printed).toContain("-P60.00");
    expect(printed).toContain("P240.00");
    expect(printed).toContain("P260.00");
  });
});
