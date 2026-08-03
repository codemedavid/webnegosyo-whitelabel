import { orderSummaryRows } from "./order-summary-rows";

/**
 * The money rows shown beneath an order's items.
 *
 * These rules already existed, buried inside `receipt-formatter.ts` as string
 * building. They are lifted out here because the merchant app's order screens
 * need the same rows as data: today they list items and then jump straight to
 * a total, so a discounted order shows lines that do not add up to what was
 * charged and nothing on screen explains the gap.
 *
 * One source, two renderers — a second copy of "when do we show a subtotal"
 * is how a receipt and a screen start disagreeing about the same sale.
 */

describe("orderSummaryRows", () => {
  it("shows only a total for a plain sale", () => {
    // Nothing sits between the items and the total, so a subtotal row would
    // just repeat the sum the customer can already see.
    const rows = orderSummaryRows({ subtotal: 200, total: 200 });

    expect(rows).toEqual([{ kind: "total", label: "Total", amount: 200 }]);
  });

  it("shows a subtotal once a delivery fee sits between", () => {
    const rows = orderSummaryRows({ subtotal: 200, deliveryFee: 50, total: 250 });

    expect(rows.map((r) => r.kind)).toEqual(["subtotal", "delivery", "total"]);
  });

  it("shows a subtotal once a discount sits between", () => {
    // Otherwise the discount is read with no stated starting point and the
    // order cannot be checked by adding it up.
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 180,
      discount: { total: 20, lines: [{ label: "WELCOME10", amount: 20 }] },
    });

    expect(rows.map((r) => r.kind)).toEqual(["subtotal", "discount", "total"]);
  });

  it("gives every discount its own row, so each can be named", () => {
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 150,
      discount: {
        total: 50,
        lines: [
          { label: "WELCOME10", amount: 20 },
          { label: "Discount — Damaged item", amount: 30 },
        ],
      },
    });

    expect(rows.filter((r) => r.kind === "discount")).toEqual([
      { kind: "discount", label: "WELCOME10", amount: 20 },
      { kind: "discount", label: "Discount — Damaged item", amount: 30 },
    ]);
  });

  it("reports a discount amount that no line accounts for", () => {
    // A free-delivery voucher has no line of its own, but the money still came
    // off. Dropping it would leave rows that do not reconcile to the total.
    const rows = orderSummaryRows({
      subtotal: 200,
      deliveryFee: 50,
      total: 200,
      discount: { total: 50, lines: [] },
    });

    expect(rows.filter((r) => r.kind === "discount")).toEqual([
      { kind: "discount", label: "Discount", amount: 50 },
    ]);
  });

  it("does not invent a remainder row when the lines already add up", () => {
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 180,
      discount: { total: 20, lines: [{ label: "WELCOME10", amount: 20 }] },
    });

    expect(rows.filter((r) => r.kind === "discount")).toHaveLength(1);
  });

  it("reports amounts as magnitudes, leaving the minus sign to the renderer", () => {
    // A screen and a thermal printer show a deduction differently; the shape
    // says what a row IS, not how it looks.
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 180,
      discount: { total: 20, lines: [{ label: "WELCOME10", amount: 20 }] },
    });

    expect(rows.find((r) => r.kind === "discount")?.amount).toBe(20);
  });

  it("omits a delivery fee of zero rather than showing a free line", () => {
    const rows = orderSummaryRows({ subtotal: 200, deliveryFee: 0, total: 200 });

    expect(rows.some((r) => r.kind === "delivery")).toBe(false);
  });

  it("always ends with the total that was actually charged", () => {
    // The stored total is authoritative: it is what the customer paid, even
    // if the parts no longer reconstruct it.
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 999,
      discount: { total: 20, lines: [{ label: "WELCOME10", amount: 20 }] },
    });

    expect(rows[rows.length - 1]).toEqual({ kind: "total", label: "Total", amount: 999 });
  });

  it("survives a missing discount payload", () => {
    const rows = orderSummaryRows({ subtotal: 200, total: 200, discount: null });

    expect(rows).toHaveLength(1);
  });

  it("ignores a corrupt discount line rather than showing a negative deduction", () => {
    const rows = orderSummaryRows({
      subtotal: 200,
      total: 180,
      discount: {
        total: 20,
        lines: [
          { label: "WELCOME10", amount: 20 },
          { label: "Corrupt", amount: Number.NaN },
        ],
      },
    });

    expect(rows.filter((r) => r.kind === "discount")).toEqual([
      { kind: "discount", label: "WELCOME10", amount: 20 },
    ]);
  });
});
