/**
 * Which sales belong to ONE person's drawer.
 *
 * pos-sales.ts answers the day; this answers the shift. A sale belongs to a
 * shift's drawer when the register stamped this cashier onto it AND it was
 * rung inside the shift's window. Nothing else does — an online order has no
 * hand in the drawer, and a sale nobody is stamped on cannot be pinned on
 * anyone. Deliberately derived (cashier + window) rather than stamping a
 * shift id onto orders: orders live in Convex OR platform Supabase per
 * tenant, and a derived attribution works identically on both.
 */

import type { CounterSale, CounterPayment } from "./pos-sales";
import { selectShiftDrawerSales, summarizeShiftDrawer } from "./shift-drawer";

const OPENED_AT = "2026-08-20T08:00:00Z";
const OPENED_MS = Date.parse(OPENED_AT);
const HOUR = 60 * 60 * 1000;

const SHIFT = {
  staffUserId: "u1",
  openedAt: OPENED_AT,
  closedAt: null as string | null,
};

function sale(overrides: Partial<CounterSale>): CounterSale {
  return {
    _id: "o1",
    _creationTime: OPENED_MS + HOUR,
    source: "pos",
    status: "delivered",
    total: 100,
    paymentMethod: "Cash",
    customerData: { pos: { cashierId: "u1" } },
    ...overrides,
  };
}

describe("selectShiftDrawerSales", () => {
  it("keeps a sale this cashier rang inside the window", () => {
    const kept = selectShiftDrawerSales([sale({})], SHIFT, OPENED_MS + 2 * HOUR);
    expect(kept.map((s) => s._id)).toEqual(["o1"]);
  });

  it("drops another cashier's sale — their drawer, their number", () => {
    const other = sale({ _id: "o2", customerData: { pos: { cashierId: "u2" } } });
    expect(selectShiftDrawerSales([other], SHIFT, OPENED_MS + 2 * HOUR)).toEqual([]);
  });

  it("drops a sale rung before the shift opened", () => {
    const early = sale({ _id: "o3", _creationTime: OPENED_MS - 1 });
    expect(selectShiftDrawerSales([early], SHIFT, OPENED_MS + 2 * HOUR)).toEqual([]);
  });

  it("drops a sale rung after the shift closed", () => {
    const closedShift = { ...SHIFT, closedAt: "2026-08-20T16:00:00Z" };
    const late = sale({ _id: "o4", _creationTime: Date.parse(closedShift.closedAt) + 1 });
    expect(
      selectShiftDrawerSales([late], closedShift, OPENED_MS + 24 * HOUR),
    ).toEqual([]);
  });

  it("an open shift runs to `now`, not forever", () => {
    // The screen refreshes; a sale rung a second ago belongs to the drawer.
    const fresh = sale({ _id: "o5", _creationTime: OPENED_MS + 3 * HOUR });
    expect(
      selectShiftDrawerSales([fresh], SHIFT, OPENED_MS + 3 * HOUR).map((s) => s._id),
    ).toEqual(["o5"]);
  });

  it("drops an online order even when this cashier confirmed it in-window", () => {
    // The customer's GCash never touched this drawer. Store-day totals count
    // confirmed online orders (pos-sales SourcePolicy); a PERSONAL drawer
    // must not, or every cashier who taps Confirm inherits money they never
    // held.
    const online = sale({ _id: "o6", source: "web", customerData: {} });
    expect(selectShiftDrawerSales([online], SHIFT, OPENED_MS + 2 * HOUR)).toEqual([]);
  });

  it("drops an unattributed counter sale rather than guessing", () => {
    // A sale with no cashier stamped cannot be pinned on anyone. Understating
    // one drawer is safer than charging a cashier for a colleague's sale.
    const ghost = sale({ _id: "o7", customerData: { pos: {} } });
    expect(selectShiftDrawerSales([ghost], SHIFT, OPENED_MS + 2 * HOUR)).toEqual([]);
  });

  it("drops a cancelled sale — the drawer never held that money", () => {
    const cancelled = sale({ _id: "o8", status: "cancelled" });
    expect(selectShiftDrawerSales([cancelled], SHIFT, OPENED_MS + 2 * HOUR)).toEqual([]);
  });
});

describe("summarizeShiftDrawer", () => {
  it("totals the drawer with the same arithmetic as the day summary", () => {
    const sales = [
      sale({ _id: "a", total: 100, paymentMethod: "Cash" }),
      sale({ _id: "b", total: 50, paymentMethod: "GCash" }),
      sale({ _id: "c", total: 30, customerData: { pos: { cashierId: "u2" } } }),
    ];

    const summary = summarizeShiftDrawer(sales, [], SHIFT, OPENED_MS + 2 * HOUR);

    expect(summary.saleCount).toBe(2);
    expect(summary.grossTotal).toBe(150);
    expect(summary.cashTotal).toBe(100);
    expect(summary.nonCashTotal).toBe(50);
  });

  it("lets a settlement ledger override the sale's single payment method", () => {
    // A bill paid by GCash whose cash top-up was taken after an edit: the
    // rows say what actually entered the drawer, exactly as in pos-sales.
    const sales = [sale({ _id: "a", total: 120, paymentMethod: "GCash" })];
    const payments: CounterPayment[] = [
      { orderId: "a", kind: "charge", amount: 100, paymentMethodName: "GCash" },
      { orderId: "a", kind: "charge", amount: 20, paymentMethodName: "Cash" },
    ];

    const summary = summarizeShiftDrawer(sales, payments, SHIFT, OPENED_MS + 2 * HOUR);

    expect(summary.cashTotal).toBe(20);
    expect(summary.nonCashTotal).toBe(100);
  });

  it("ignores settlement rows for sales outside the shift", () => {
    const foreign = sale({ _id: "x", customerData: { pos: { cashierId: "u2" } } });
    const payments: CounterPayment[] = [
      { orderId: "x", kind: "charge", amount: 999, paymentMethodName: "Cash" },
    ];

    const summary = summarizeShiftDrawer([foreign], payments, SHIFT, OPENED_MS + 2 * HOUR);

    expect(summary.saleCount).toBe(0);
    expect(summary.cashTotal).toBe(0);
  });
});

it("counts a collection on an older cashier's bill in the collector's current shift", () => {
  const old = sale({ _id: "old", _creationTime: OPENED_MS - HOUR, customerData: { pos: { cashierId: "other" } } });
  const result = summarizeShiftDrawer([old], [
    { orderId: "old", kind: "charge", amount: 60, paymentMethodName: "Cash", recordedBy: SHIFT.staffUserId, _creationTime: OPENED_MS + HOUR },
    { orderId: "old", kind: "charge", amount: 40, paymentMethodName: "Cash", recordedBy: "other", _creationTime: OPENED_MS + HOUR },
  ], SHIFT, OPENED_MS + 2 * HOUR);
  expect(result.cashTotal).toBe(60);
});

it("does not pull another branch's cash into a personal drawer", () => {
  const other = sale({ customerData: { outlet_id: "south", pos: { cashierId: SHIFT.staffUserId } } });
  expect(summarizeShiftDrawer([other], [], { ...SHIFT, outletId: "north" }, OPENED_MS + HOUR).cashTotal).toBe(0);
});
