import { orderMethodSlices } from "./analytics-payment-slices";

describe("orderMethodSlices", () => {
  it("reads an order with no ledger as paid wholly by its own method", () => {
    expect(orderMethodSlices({ total: 300, paymentMethod: "Cash" })).toEqual([{ method: "Cash", amount: 300 }]);
  });

  it("names an order with no method and no ledger Unknown", () => {
    expect(orderMethodSlices({ total: 300 })).toEqual([{ method: "Unknown", amount: 300 }]);
  });

  it("splits a bill paid ₱120 by GCash and the rest in cash", () => {
    const slices = orderMethodSlices({
      total: 300,
      paymentMethod: "Cash",
      payments: [
        { kind: "charge", amount: 120, method: "GCash" },
        { kind: "charge", amount: 180, method: "Cash" },
      ],
    });
    expect(slices).toEqual([
      { method: "GCash", amount: 120 },
      { method: "Cash", amount: 180 },
    ]);
  });

  it("leaves what is still unpaid under the order's own method", () => {
    const slices = orderMethodSlices({
      total: 300,
      paymentMethod: "Cash",
      payments: [{ kind: "charge", amount: 120, method: "GCash" }],
    });
    expect(slices).toEqual([
      { method: "GCash", amount: 120 },
      { method: "Cash", amount: 180 },
    ]);
  });

  it("nets refunds against the method they went back through", () => {
    const slices = orderMethodSlices({
      total: 250,
      paymentMethod: "GCash",
      payments: [
        { kind: "charge", amount: 300, method: "GCash" },
        { kind: "refund", amount: 50, method: "GCash" },
      ],
    });
    expect(slices).toEqual([{ method: "GCash", amount: 250 }]);
  });

  it("gives a ledger row with no method name to the order's method", () => {
    const slices = orderMethodSlices({
      total: 300,
      paymentMethod: "Maya",
      payments: [
        { kind: "charge", amount: 100, method: "GCash" },
        { kind: "charge", amount: 200 },
      ],
    });
    expect(slices).toEqual([
      { method: "GCash", amount: 100 },
      { method: "Maya", amount: 200 },
    ]);
  });

  it("never reports more than the order's total, scaling an over-collected ledger down", () => {
    const slices = orderMethodSlices({
      total: 200,
      paymentMethod: "Cash",
      payments: [
        { kind: "charge", amount: 150, method: "GCash" },
        { kind: "charge", amount: 150, method: "Cash" },
      ],
    });
    expect(slices).toEqual([
      { method: "GCash", amount: 100 },
      { method: "Cash", amount: 100 },
    ]);
  });

  it("keeps a free order in its own method so it is still counted", () => {
    expect(orderMethodSlices({ total: 0, paymentMethod: "Cash", payments: [] })).toEqual([{ method: "Cash", amount: 0 }]);
  });
});
