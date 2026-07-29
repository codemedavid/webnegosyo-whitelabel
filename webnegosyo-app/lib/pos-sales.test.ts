import { summarizeCounterSales, type CounterSale } from "./pos-sales";

function sale(overrides: Partial<CounterSale> = {}): CounterSale {
  return {
    _id: "o1",
    _creationTime: 0,
    source: "pos",
    status: "confirmed",
    total: 100,
    paymentMethod: "Cash",
    customerData: { pos: { cashTendered: 200, changeDue: 100 } },
    ...overrides,
  };
}

describe("summarizeCounterSales", () => {
  it("counts only counter sales, ignoring web and QR-handoff orders", () => {
    const summary = summarizeCounterSales([
      sale(),
      sale({ _id: "o2", source: "web" }),
      sale({ _id: "o3", source: "qr_handoff" }),
    ]);
    expect(summary.saleCount).toBe(1);
    expect(summary.grossTotal).toBe(100);
  });

  it("separates the cash drawer from non-cash takings", () => {
    const summary = summarizeCounterSales([
      sale({ _id: "o1", total: 100 }),
      sale({
        _id: "o2",
        total: 250,
        paymentMethod: "GCash",
        customerData: { pos: { proofUrl: "https://x/y.jpg" } },
      }),
    ]);
    expect(summary.cashTotal).toBe(100);
    expect(summary.nonCashTotal).toBe(250);
    expect(summary.grossTotal).toBe(350);
  });

  it("excludes cancelled sales from every total", () => {
    const summary = summarizeCounterSales([
      sale({ _id: "o1", total: 100 }),
      sale({ _id: "o2", total: 500, status: "cancelled" }),
    ]);
    expect(summary.saleCount).toBe(1);
    expect(summary.grossTotal).toBe(100);
  });

  it("reports the change handed out so the drawer can be reconciled", () => {
    const summary = summarizeCounterSales([
      sale({ _id: "o1", total: 100, customerData: { pos: { cashTendered: 200, changeDue: 100 } } }),
      sale({ _id: "o2", total: 50, customerData: { pos: { cashTendered: 100, changeDue: 50 } } }),
    ]);
    expect(summary.changeGiven).toBe(150);
  });

  it("returns an all-zero summary for a day with no sales", () => {
    expect(summarizeCounterSales([])).toEqual({
      saleCount: 0,
      grossTotal: 0,
      cashTotal: 0,
      nonCashTotal: 0,
      changeGiven: 0,
    });
  });

  it("tolerates a sale with no POS payload rather than throwing", () => {
    const summary = summarizeCounterSales([sale({ customerData: undefined })]);
    expect(summary.saleCount).toBe(1);
    expect(summary.changeGiven).toBe(0);
  });

  it("classifies a sale with no payment method as non-cash", () => {
    const summary = summarizeCounterSales([sale({ paymentMethod: undefined, total: 80 })]);
    expect(summary.cashTotal).toBe(0);
    expect(summary.nonCashTotal).toBe(80);
  });

  // --- order editing --------------------------------------------------
  // Once a placed order can be edited, `sale.total` alone stops describing
  // what physically moved through the drawer.

  it("splits the drawer by how each settlement was actually taken", () => {
    // Paid ₱450 by GCash, then an edit added ₱120 collected in CASH. The
    // order's payment method still says GCash, so charging the whole ₱570 to
    // non-cash would hide ₱120 sitting in the till.
    const summary = summarizeCounterSales(
      [sale({ _id: "o1", total: 570, paymentMethod: "GCash", customerData: {} })],
      [
        { orderId: "o1", kind: "charge", amount: 450, paymentMethodName: "GCash" },
        { orderId: "o1", kind: "charge", amount: 120, paymentMethodName: "Cash" },
      ],
    );

    expect(summary.cashTotal).toBe(120);
    expect(summary.nonCashTotal).toBe(450);
    expect(summary.grossTotal).toBe(570);
  });

  it("subtracts a cash refund from the drawer", () => {
    // Paid ₱450 cash, edit dropped the bill, ₱120 handed back from the till.
    const summary = summarizeCounterSales(
      [sale({ _id: "o1", total: 330, paymentMethod: "Cash", customerData: {} })],
      [
        { orderId: "o1", kind: "charge", amount: 450, paymentMethodName: "Cash" },
        { orderId: "o1", kind: "refund", amount: 120, paymentMethodName: "Cash" },
      ],
    );

    expect(summary.cashTotal).toBe(330);
    expect(summary.refundsPaid).toBe(120);
  });

  it("reports refunds separately so they can be accounted for", () => {
    const summary = summarizeCounterSales(
      [sale({ _id: "o1", total: 330, paymentMethod: "GCash", customerData: {} })],
      [
        { orderId: "o1", kind: "charge", amount: 450, paymentMethodName: "GCash" },
        { orderId: "o1", kind: "refund", amount: 120, paymentMethodName: "GCash" },
      ],
    );

    expect(summary.refundsPaid).toBe(120);
    expect(summary.nonCashTotal).toBe(330);
  });

  it("ignores ledger rows belonging to another day's order", () => {
    const summary = summarizeCounterSales(
      [sale({ _id: "o1", total: 100, customerData: {} })],
      [{ orderId: "o-other", kind: "charge", amount: 999, paymentMethodName: "Cash" }],
    );

    expect(summary.cashTotal).toBe(100);
  });

  it("falls back to the order's own method for sales with no ledger rows", () => {
    // Every counter sale rung up before the ledger existed.
    const summary = summarizeCounterSales([sale({ _id: "o1", total: 100 })], []);

    expect(summary.cashTotal).toBe(100);
    expect(summary.refundsPaid).toBe(0);
  });

  it("rounds money totals to centavos", () => {
    const summary = summarizeCounterSales([
      sale({ _id: "o1", total: 0.1 }),
      sale({ _id: "o2", total: 0.2 }),
    ]);
    expect(summary.grossTotal).toBe(0.3);
  });
});
