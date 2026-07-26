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

  it("rounds money totals to centavos", () => {
    const summary = summarizeCounterSales([
      sale({ _id: "o1", total: 0.1 }),
      sale({ _id: "o2", total: 0.2 }),
    ]);
    expect(summary.grossTotal).toBe(0.3);
  });
});
