/**
 * "Unpaid" on an order that was collected at the counter.
 *
 * `orders.payment_status` is written at checkout and by the register's tender.
 * Collecting on a placed order appends a settlement row instead — the ledger,
 * and the `amount_paid` cache the trigger keeps in step with it — and nothing
 * ever went back to the status column. So a cashier took the money, the card
 * kept its red "Unpaid" chip, and the order read as owing its whole total
 * forever. Two merchants collected the same bill twice because of it.
 *
 * These tests pin both halves of the answer: a row is read as paid when EITHER
 * side says so, and a collection that squares the bill writes the status.
 */
import { isOrderUnpaid, shouldMarkOrderPaid } from "./order-paid-state";

describe("isOrderUnpaid", () => {
  it("reads a ledger-settled order as paid even though its status still says pending", () => {
    // Arrange — exactly the shape the bug leaves behind.
    const order = { paymentStatus: "pending", total: 95, amountPaid: 95 };

    // Act
    const unpaid = isOrderUnpaid(order);

    // Assert
    expect(unpaid).toBe(false);
  });

  it("still reads a part-paid order as unpaid", () => {
    expect(isOrderUnpaid({ paymentStatus: "pending", total: 500, amountPaid: 200 })).toBe(
      true,
    );
  });

  it("reads an order with nothing collected as unpaid", () => {
    expect(isOrderUnpaid({ paymentStatus: "pending", total: 500, amountPaid: 0 })).toBe(
      true,
    );
  });

  /**
   * Convex deployments older than the ledger patch no `amountPaid` at all, and
   * an absent figure must not be read as zero collected NOR as settled — the
   * status column is the only witness those stores have.
   */
  it("falls back to the status when the backend reports no collected figure", () => {
    expect(isOrderUnpaid({ paymentStatus: "pending", total: 500 })).toBe(true);
    expect(isOrderUnpaid({ paymentStatus: "paid", total: 500 })).toBe(false);
  });

  /**
   * An order paid online carries `paid` with an EMPTY ledger — the money never
   * passed through a settlement row. Deriving purely from the ledger would ask
   * the cashier to collect a bill the customer already settled.
   */
  it("keeps an order paid by status paid when its ledger is empty", () => {
    expect(isOrderUnpaid({ paymentStatus: "paid", total: 500, amountPaid: 0 })).toBe(
      false,
    );
  });

  /** `verified` is an approved payment proof — money in hand, not a promise. */
  it("treats a verified payment proof as paid", () => {
    expect(isOrderUnpaid({ paymentStatus: "verified", total: 500, amountPaid: 0 })).toBe(
      false,
    );
  });

  /**
   * A failed online attempt followed by cash at the counter. The ledger is the
   * one that saw the money.
   */
  it("reads a failed payment that was later collected in person as paid", () => {
    expect(isOrderUnpaid({ paymentStatus: "failed", total: 80, amountPaid: 80 })).toBe(
      false,
    );
  });

  it("says nothing about an order that carries no payment status at all", () => {
    expect(isOrderUnpaid({ total: 500 })).toBe(false);
  });

  it("does not hand a cashier a sub-centavo balance to chase", () => {
    expect(isOrderUnpaid({ paymentStatus: "pending", total: 100, amountPaid: 99.999 })).toBe(
      false,
    );
  });

  it("reads an overpaid order as paid rather than as owing", () => {
    expect(isOrderUnpaid({ paymentStatus: "pending", total: 100, amountPaid: 190 })).toBe(
      false,
    );
  });

  it("ignores a non-numeric collected figure rather than reading it as settled", () => {
    expect(
      isOrderUnpaid({ paymentStatus: "pending", total: 100, amountPaid: Number.NaN }),
    ).toBe(true);
  });
});

describe("shouldMarkOrderPaid", () => {
  it("marks the order paid when the collection squares the bill", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "pending", balanceAfter: 0 })).toBe(true);
  });

  it("leaves the status alone when the collection was partial", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "pending", balanceAfter: 49 })).toBe(
      false,
    );
  });

  it("writes nothing when the order already reads as paid", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "paid", balanceAfter: 0 })).toBe(false);
    expect(shouldMarkOrderPaid({ paymentStatus: "verified", balanceAfter: 0 })).toBe(
      false,
    );
  });

  it("marks a failed online payment paid once it is collected in person", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "failed", balanceAfter: 0 })).toBe(true);
  });

  it("treats sub-centavo drift as square", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "pending", balanceAfter: 0.004 })).toBe(
      true,
    );
  });

  it("marks an overpaid order paid — nothing is owed on it", () => {
    expect(shouldMarkOrderPaid({ paymentStatus: "pending", balanceAfter: -5 })).toBe(true);
  });

  it("writes the status on an order that carries none yet", () => {
    expect(shouldMarkOrderPaid({ balanceAfter: 0 })).toBe(true);
  });
});
