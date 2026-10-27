/**
 * Shift sales counted on the tablet, for a store whose orders the server
 * report cannot read (Convex, a store database, or a platform database the
 * report function has not reached yet). Same figures as the server's one
 * sales definition, in whole centavos: net = bill − service − delivery
 * (after its discount); voids are counted apart; unpaid is what the ledger
 * and the payment status have not covered; a ledger refund is money handed
 * back, never taken off sales twice.
 */

import { countShiftSalesOnDevice, deviceOrdersCover, type DeviceSalesOrder } from "./shift-sales-fallback";
import type { StaffPayment } from "../shift-drawer";

const FROM = Date.parse("2026-10-24T04:00:00.000Z"); // 12:00 PM Manila
const TO = Date.parse("2026-10-24T12:00:00.000Z"); // 8:00 PM Manila

function order(id: string, overrides: Partial<DeviceSalesOrder> = {}): DeviceSalesOrder {
  return {
    _id: id,
    _creationTime: FROM + 60_000,
    source: "pos",
    status: "delivered",
    paymentStatus: "paid",
    total: 100,
    paymentMethod: "Cash",
    orderType: "dine_in",
    ...overrides,
  };
}

function count(orders: DeviceSalesOrder[], payments: StaffPayment[] = [], extra: Partial<Parameters<typeof countShiftSalesOnDevice>[0]> = {}) {
  return countShiftSalesOnDevice({ orders, payments, fromMs: FROM, toMs: TO, shift: null, hidden: false, ...extra });
}

describe("countShiftSalesOnDevice", () => {
  it("labels its figures as counted on this tablet", () => {
    expect(count([order("a")]).source).toBe("device");
  });

  it("keeps only orders inside the half-open window", () => {
    const report = count([
      order("before", { _creationTime: FROM - 1 }),
      order("first", { _creationTime: FROM }),
      order("last", { _creationTime: TO - 1 }),
      order("after", { _creationTime: TO }),
    ]);
    expect(report.receipts.map((r) => r.orderId)).toEqual(["first", "last"]);
    expect(report.summary?.orders).toBe(2);
  });

  it("adds money in whole centavos, with no float drift", () => {
    const report = count([order("a", { total: 0.1 }), order("b", { total: 0.2 }), order("c", { total: 99.95 })]);
    expect(report.summary?.netCents).toBe(10025);
    expect(report.summary?.collectedCents).toBe(10025);
  });

  it("takes service charge and delivery (after its discount) out of net sales", () => {
    const report = count([
      order("a", {
        total: 1150,
        serviceCharge: 100,
        deliveryFee: 80,
        orderType: "delivery",
        customerData: { discount: { total: 50, deliveryDiscount: 30, lines: [], allocationsByLine: {} } },
      }),
    ]);
    // delivery kept = 80 − 30 = 50; food discount = 50 − 30 = 20
    expect(report.summary).toMatchObject({
      serviceChargeCents: 10000,
      deliveryCents: 5000,
      discountCents: 2000,
      grossCents: 102000,
      netCents: 100000,
    });
  });

  it("counts a cancelled order as a void, never as a sale", () => {
    const report = count([order("a"), order("v", { status: "cancelled", total: 320 })]);
    expect(report.summary).toMatchObject({ orders: 1, netCents: 10000, voidCount: 1, voidCents: 32000 });
    expect(report.receipts.find((r) => r.orderId === "v")?.status).toBe("void");
  });

  it("calls an order with a refunded status 'refunded' and keeps it out of sales", () => {
    const report = count([order("r", { status: "refunded", total: 250 })]);
    expect(report.summary).toMatchObject({ orders: 0, netCents: 0, voidCount: 1 });
    expect(report.receipts[0].status).toBe("refunded");
  });

  it("reads an order still owing as unpaid, with what the ledger already took as collected", () => {
    const report = count(
      [order("u", { paymentStatus: "pending", status: "preparing", total: 500 })],
      [{ orderId: "u", kind: "charge", amount: 200, paymentMethodName: "GCash" }],
    );
    expect(report.summary).toMatchObject({ collectedCents: 20000, unpaidCents: 30000 });
    expect(report.receipts[0].status).toBe("unpaid");
    expect(report.payments).toEqual([{ key: "gcash", label: "GCash", cents: 20000, count: 1 }]);
  });

  it("never invents a debt for a handed-over order that is not a table's tab", () => {
    const report = count([order("h", { paymentStatus: "pending", status: "delivered", total: 300 })]);
    expect(report.summary?.unpaidCents).toBe(0);
    expect(report.receipts[0].status).toBe("paid");
  });

  it("keeps a table's served tab unpaid until its bill is paid", () => {
    const report = count([
      order("t", { paymentStatus: "pending", status: "delivered", total: 300, customerData: { table_number: "4" } }),
    ]);
    expect(report.summary?.unpaidCents).toBe(30000);
  });

  it("reports a ledger refund as money handed back without cutting net sales again", () => {
    const report = count(
      [order("e", { total: 80 })],
      [
        { orderId: "e", kind: "charge", amount: 100, paymentMethodName: "Cash" },
        { orderId: "e", kind: "refund", amount: 20, paymentMethodName: "Cash" },
      ],
    );
    expect(report.summary).toMatchObject({ netCents: 8000, refundCents: 2000, collectedCents: 8000, overpaidCents: 0 });
    expect(report.payments).toEqual([{ key: "cash", label: "Cash", cents: 8000, count: 1 }]);
  });

  it("splits a bill paid two ways by the ledger, the rest under the checkout method", () => {
    const report = count(
      [order("s", { total: 500, paymentMethod: "Cash" })],
      [{ orderId: "s", kind: "charge", amount: 120, paymentMethodName: "GCash" }],
    );
    expect(report.payments).toEqual([
      { key: "cash", label: "Cash", cents: 38000, count: 1 },
      { key: "gcash", label: "GCash", cents: 12000, count: 1 },
    ]);
  });

  it("groups by order type and channel, net sales only", () => {
    const report = count([
      order("a", { orderType: "dine_in", source: "pos", total: 100 }),
      order("b", { orderType: "pickup", source: "web", total: 300 }),
      order("c", { orderType: "pickup", source: "web", total: 200 }),
    ]);
    expect(report.orderTypes).toEqual([
      { key: "pickup", label: "Pickup", orders: 2, netCents: 50000 },
      { key: "dine_in", label: "Dine-in", orders: 1, netCents: 10000 },
    ]);
    expect(report.channels).toEqual([
      { key: "web", label: "Online", orders: 2, netCents: 50000 },
      { key: "pos", label: "Counter", orders: 1, netCents: 10000 },
    ]);
  });

  it("numbers receipts the way the app prints them and finds the first and last", () => {
    const report = count([
      order("late", { _creationTime: FROM + 120_000, dailyNumber: 12 }),
      order("early", { _creationTime: FROM + 60_000, dailyNumber: 9 }),
    ]);
    expect(report.receipts.map((r) => r.number)).toEqual(["#09", "#12"]);
    expect(report.firstNumber).toBe("#09");
    expect(report.lastNumber).toBe("#12");
  });

  it("narrows to one branch when the shift has one", () => {
    const report = count([order("a", { outlet_id: "b1" }), order("b", { outlet_id: "b2" })], [], { outletId: "b1" });
    expect(report.receipts.map((r) => r.orderId)).toEqual(["a"]);
  });

  it("caps the receipt list and says so", () => {
    const orders = Array.from({ length: 5 }, (_, i) => order(`o${i}`, { _creationTime: FROM + i }));
    const report = count(orders, [], { receiptLimit: 3 });
    expect(report.receipts).toHaveLength(3);
    expect(report.receiptsTruncated).toBe(true);
    // The totals still count every order.
    expect(report.summary?.orders).toBe(5);
  });

  it("hides every peso when the shift is blind, keeping the list and counts", () => {
    const report = count([order("a"), order("v", { status: "cancelled" })], [], { hidden: true });
    expect(report.hidden).toBe(true);
    expect(report.summary).toBeNull();
    expect(report.payments).toBeNull();
    expect(report.orderTypes).toBeNull();
    expect(report.receipts.map((r) => r.totalCents)).toEqual([null, null]);
    expect(report.receipts.map((r) => r.status)).toEqual(["paid", "void"]);
  });

  it("leaves top items unknown (the tablet does not read order lines here)", () => {
    expect(count([order("a")]).items).toBeNull();
  });

  it("answers an empty shift with zero sales, which is a fact, not a missing figure", () => {
    const report = count([]);
    expect(report.summary).toMatchObject({ orders: 0, netCents: 0 });
    expect(report.receipts).toEqual([]);
    expect(report.firstNumber).toBeNull();
  });
});

describe("deviceOrdersCover", () => {
  const at = (ms: number) => ({ _creationTime: ms });

  it("trusts a window read that came back under its cap", () => {
    expect(deviceOrdersCover({ orders: [at(FROM)], isWindowRead: true, fromMs: FROM })).toBe(true);
    expect(deviceOrdersCover({ orders: Array.from({ length: 1000 }, () => at(FROM)), isWindowRead: true, fromMs: FROM })).toBe(false);
  });

  it("trusts a full newest-first page only when it reaches back past the window's start", () => {
    const full = Array.from({ length: 200 }, (_, i) => at(FROM + i));
    expect(deviceOrdersCover({ orders: full, isWindowRead: false, fromMs: FROM })).toBe(false);
    expect(deviceOrdersCover({ orders: [...full.slice(1), at(FROM - 1)], isWindowRead: false, fromMs: FROM })).toBe(true);
    expect(deviceOrdersCover({ orders: full.slice(0, 10), isWindowRead: false, fromMs: FROM })).toBe(true);
  });
});
