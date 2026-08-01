import {
  toPaymentLines,
  toRevisionLines,
  summarizeSettlement,
  type OrderPaymentLike,
  type OrderRevisionLike,
} from "./order-history-view";

/**
 * What the payments and revision-history cards on the order detail screen show.
 *
 * This lives in `lib/` rather than in the component because Jest is scoped to
 * `lib/` and `theme/` in this app. "Is the refund shown as money leaving?" and
 * "does the card agree with the settle screen about what is still owed?" are
 * exactly the questions that must not be answered by eyeballing a simulator.
 *
 * The cards are the merchant's defence when a customer disputes an edited bill
 * weeks later, so a row that reads plausibly but wrongly is worse than no row.
 */

function payment(overrides: Partial<OrderPaymentLike> = {}): OrderPaymentLike {
  return {
    _id: "pay-1",
    _creationTime: Date.parse("2026-07-29T02:00:00.000Z"),
    kind: "charge",
    amount: 150,
    ...overrides,
  };
}

function revision(overrides: Partial<OrderRevisionLike> = {}): OrderRevisionLike {
  return {
    _id: "rev-1",
    _creationTime: Date.parse("2026-07-29T02:30:00.000Z"),
    revisionNumber: 1,
    totalBefore: 250,
    totalAfter: 370,
    ...overrides,
  };
}

describe("toPaymentLines", () => {
  it("shows a charge as money coming in", () => {
    // Act
    const [line] = toPaymentLines([payment({ kind: "charge", amount: 150 })]);

    // Assert
    expect(line.direction).toBe("in");
    expect(line.amountLabel).toBe("+₱150.00");
  });

  it("shows a refund as money going out", () => {
    // Arrange: the ledger stores refunds unsigned, with `kind` carrying the
    // direction. Rendering the raw amount would show a refund as income.
    const [line] = toPaymentLines([payment({ kind: "refund", amount: 40 })]);

    // Assert
    expect(line.direction).toBe("out");
    expect(line.amountLabel).toBe("−₱40.00");
  });

  it("always shows centavos, so a total can be checked by hand", () => {
    const [line] = toPaymentLines([payment({ amount: 150.5 })]);

    expect(line.amountLabel).toBe("+₱150.50");
  });

  it("names the method and reference a merchant would search for", () => {
    // Act
    const [line] = toPaymentLines([
      payment({ paymentMethodName: "GCash", reference: "REF-9" }),
    ]);

    // Assert
    expect(line.methodLabel).toBe("GCash");
    expect(line.reference).toBe("REF-9");
  });

  it("falls back to a readable method rather than rendering undefined", () => {
    // Arrange: counter sales rung up before payment methods were recorded.
    const [line] = toPaymentLines([payment({ paymentMethodName: undefined })]);

    // Assert
    expect(line.methodLabel).toBe("Payment");
  });

  it("keeps the ledger in the order it was taken", () => {
    // Arrange: both backends return payments oldest-first, and the sequence IS
    // the story — an initial tender, then a top-up, then a refund.
    const lines = toPaymentLines([
      payment({ _id: "a", amount: 150 }),
      payment({ _id: "b", kind: "refund", amount: 40 }),
    ]);

    // Assert
    expect(lines.map((l) => l._id)).toEqual(["a", "b"]);
  });

  it("returns nothing for an order with no settlements", () => {
    expect(toPaymentLines([])).toEqual([]);
  });

  it("marks a proof the merchant can open", () => {
    const [line] = toPaymentLines([payment({ proofUrl: "https://ik.example/p.jpg" })]);

    expect(line.proofUrl).toBe("https://ik.example/p.jpg");
  });
});

describe("toRevisionLines", () => {
  it("reads an edit that raised the bill as an increase", () => {
    // Act
    const [line] = toRevisionLines([revision({ totalBefore: 250, totalAfter: 370 })]);

    // Assert
    expect(line.direction).toBe("up");
    expect(line.deltaLabel).toBe("+₱120.00");
    expect(line.title).toBe("Revision 1");
    expect(line.totalsLabel).toBe("₱250.00 → ₱370.00");
  });

  it("reads an edit that lowered the bill as a decrease", () => {
    const [line] = toRevisionLines([revision({ totalBefore: 370, totalAfter: 250 })]);

    expect(line.direction).toBe("down");
    expect(line.deltaLabel).toBe("−₱120.00");
  });

  it("reads an edit that changed items but not the total as level", () => {
    // Arrange: swapping one ₱120 item for another is a real edit a merchant
    // must still be able to see, even though no money moved.
    const [line] = toRevisionLines([revision({ totalBefore: 250, totalAfter: 250 })]);

    // Assert
    expect(line.direction).toBe("level");
    expect(line.deltaLabel).toBe("₱0.00");
  });

  it("carries the reason the cashier gave", () => {
    const [line] = toRevisionLines([revision({ reason: "Customer added a drink" })]);

    expect(line.reason).toBe("Customer added a drink");
  });

  it("returns nothing for an order never edited", () => {
    expect(toRevisionLines([])).toEqual([]);
  });

  it("shows the newest edit first", () => {
    // Arrange: Convex sorts by revisionNumber desc and the platform adapter
    // orders by the same column. Re-sorting here means the card cannot be wrong
    // even if a backend's ordering ever changes.
    const lines = toRevisionLines([
      revision({ _id: "r1", revisionNumber: 1 }),
      revision({ _id: "r3", revisionNumber: 3 }),
      revision({ _id: "r2", revisionNumber: 2 }),
    ]);

    // Assert
    expect(lines.map((l) => l.revisionNumber)).toEqual([3, 2, 1]);
  });
});

describe("summarizeSettlement", () => {
  it("reports an order paid in full as settled with nothing owing", () => {
    // Act
    const summary = summarizeSettlement(250, [payment({ amount: 250 })]);

    // Assert
    expect(summary.intent).toBe("settled");
    expect(summary.balance).toBe(0);
    expect(summary.balanceLabel).toBe("₱0.00");
  });

  it("reports what is still owed after an edit raised the bill", () => {
    // Arrange: a ₱250 order paid in full, then edited up to ₱370.
    const summary = summarizeSettlement(370, [payment({ amount: 250 })]);

    // Assert
    expect(summary.intent).toBe("collect");
    expect(summary.balance).toBe(120);
    expect(summary.balanceLabel).toBe("₱120.00");
  });

  it("reports what must be returned after an edit lowered the bill", () => {
    // Arrange: a ₱370 order paid in full, then edited down to ₱250. The label
    // is unsigned because the screen says "Refund due" beside it — a minus sign
    // there would read as a negative refund.
    const summary = summarizeSettlement(250, [payment({ amount: 370 })]);

    // Assert
    expect(summary.intent).toBe("refund");
    expect(summary.balance).toBe(-120);
    expect(summary.balanceLabel).toBe("₱120.00");
  });

  it("totals charges and refunds separately, as a merchant reconciles them", () => {
    // Act
    const summary = summarizeSettlement(110, [
      payment({ amount: 150 }),
      payment({ kind: "refund", amount: 40 }),
    ]);

    // Assert
    expect(summary.totalCharged).toBe(150);
    expect(summary.totalRefunded).toBe(40);
    expect(summary.amountPaid).toBe(110);
  });

  it("reports an unpaid order as owing its whole total, not as settled", () => {
    // Arrange: an order billed but never tendered has an empty ledger. Reading
    // that as settled is the single most expensive mistake this screen can make.
    const summary = summarizeSettlement(250, []);

    // Assert
    expect(summary.intent).toBe("collect");
    expect(summary.balance).toBe(250);
  });

  it("treats sub-centavo drift as settled rather than asking for ₱0.004", () => {
    const summary = summarizeSettlement(250, [payment({ amount: 249.999 })]);

    expect(summary.intent).toBe("settled");
  });
});
