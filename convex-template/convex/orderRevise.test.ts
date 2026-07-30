import {
  assertRevisable,
  priceRevisedItems,
  computeRevisedTotal,
  countRevisedItems,
  normalizePaymentAmount,
  netAmountPaid,
  type RevisableOrderLike,
  type RevisedItemLike,
  type LedgerRowLike,
} from "./orderRevise";

/**
 * The rules an order edit obeys on the Convex backend.
 *
 * These were previously inline in `reviseOrder` / `recordPayment`, which meant
 * they were covered by nothing: neither Jest project reaches Convex handlers,
 * so "it typechecks and it bundles" was the whole of the proof for a code path
 * that rewrites a real customer's bill and moves money.
 *
 * The platform backend enforces the same rules in `order-revise.ts` and is
 * fully tested. The point of this suite is that the two backends cannot drift:
 * a merchant on Convex must be protected by exactly the same guard rails as a
 * merchant on the shared Supabase.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

function order(overrides: Partial<RevisableOrderLike> = {}): RevisableOrderLike {
  return { total: 250, revisionNumber: 1, ...overrides };
}

function item(overrides: Partial<RevisedItemLike> = {}): RevisedItemLike {
  return {
    menuItemId: "menu-1",
    menuItemName: "Latte",
    quantity: 2,
    price: 120,
    subtotal: 240,
    ...overrides,
  };
}

describe("assertRevisable", () => {
  it("accepts an edit built against the order's current revision", () => {
    // Arrange
    const current = order({ revisionNumber: 1 });

    // Act + Assert
    expect(() => assertRevisable(current, 1, [item()])).not.toThrow();
  });

  it("refuses an edit built against a stale revision", () => {
    // Arrange: another cashier saved while this screen was open. Without this
    // check the second save silently discards the first one's changes.
    const current = order({ revisionNumber: 2 });

    // Act + Assert
    expect(() => assertRevisable(current, 1, [item()])).toThrow(
      /changed while you were editing/i
    );
  });

  it("treats an order never edited as revision 0", () => {
    // Arrange: every order placed before order editing shipped has no
    // revisionNumber at all. Reading that as anything but 0 would make the
    // first edit of a legacy order impossible.
    const current = order({ revisionNumber: undefined });

    // Act + Assert
    expect(() => assertRevisable(current, 0, [item()])).not.toThrow();
  });

  it("refuses to empty an order by editing", () => {
    // Arrange: removing every line is a cancellation, which reverses stock and
    // notifies the customer. Editing must not become a back door to it.
    const current = order();

    // Act + Assert
    expect(() => assertRevisable(current, 1, [])).toThrow(/cannot be emptied/i);
  });

  it("reports the stale revision before the empty cart", () => {
    // Arrange: if the order moved on, nothing about this submission is
    // trustworthy — including its item list. Telling the cashier to re-open is
    // the only useful instruction.
    const current = order({ revisionNumber: 5 });

    // Act + Assert
    expect(() => assertRevisable(current, 1, [])).toThrow(
      /changed while you were editing/i
    );
  });
});

describe("priceRevisedItems", () => {
  it("forces each line's subtotal to price times quantity", () => {
    // Arrange: the total is built only from subtotals, so trusting a caller's
    // subtotal would make every other check here decorative.
    const submitted = [item({ price: 120, quantity: 2, subtotal: 5 })];

    // Act
    const priced = priceRevisedItems(submitted);

    // Assert
    expect(priced[0].subtotal).toBe(240);
  });

  it("builds the subtotal from the price it actually stores, so a receipt adds up", () => {
    // Arrange: 10.005 stores as 10.01. Computing the subtotal from the RAW
    // price instead would store 30.02 next to a unit price of 10.01 — a printed
    // line a customer cannot total, on the one feature whose whole purpose is
    // an edited bill that is defensible weeks later.
    const submitted = [item({ price: 10.005, quantity: 3 })];

    // Act
    const priced = priceRevisedItems(submitted);

    // Assert
    expect(priced[0].subtotal).toBe(30.03);
    expect(priced[0].subtotal).toBe(round2(priced[0].price * priced[0].quantity));
  });

  it("rounds the stored unit price too, matching the platform backend", () => {
    // Arrange: the platform path stores `round2(price)`. Storing an unrounded
    // price here would make the same edit produce different rows on the two
    // backends, and a reprinted receipt show a price no one can total.
    const submitted = [item({ price: 10.005, quantity: 1 })];

    // Act
    const priced = priceRevisedItems(submitted);

    // Assert
    expect(priced[0].price).toBe(10.01);
  });

  it("refuses a non-positive quantity", () => {
    expect(() => priceRevisedItems([item({ quantity: 0 })])).toThrow(/quantity/i);
  });

  it("refuses a quantity beyond the register's cap", () => {
    expect(() => priceRevisedItems([item({ quantity: 100 })])).toThrow(/quantity/i);
  });

  it("refuses a non-finite quantity rather than writing NaN into the bill", () => {
    expect(() => priceRevisedItems([item({ quantity: Number.NaN })])).toThrow(/quantity/i);
  });

  it("refuses a negative price", () => {
    expect(() => priceRevisedItems([item({ price: -1 })])).toThrow(/price/i);
  });

  it("refuses an implausible price", () => {
    expect(() => priceRevisedItems([item({ price: 1_000_001 })])).toThrow(/price/i);
  });

  it("allows a zero price, since a comped line is legitimate", () => {
    // Act
    const priced = priceRevisedItems([item({ price: 0, quantity: 1 })]);

    // Assert
    expect(priced[0].subtotal).toBe(0);
  });

  it("names the offending item, so a cashier knows which line to fix", () => {
    expect(() => priceRevisedItems([item({ menuItemName: "Ube Latte", quantity: 0 })])).toThrow(
      /Ube Latte/
    );
  });

  it("does not mutate the submitted items", () => {
    // Arrange
    const submitted = [item({ subtotal: 5 })];

    // Act
    priceRevisedItems(submitted);

    // Assert
    expect(submitted[0].subtotal).toBe(5);
  });
});

describe("computeRevisedTotal", () => {
  it("sums the line subtotals", () => {
    // Arrange
    const priced = priceRevisedItems([
      item({ price: 120, quantity: 2 }),
      item({ price: 50, quantity: 1 }),
    ]);

    // Act + Assert
    expect(computeRevisedTotal(priced)).toBe(290);
  });

  it("adds the delivery fee and service charge", () => {
    // Arrange
    const priced = priceRevisedItems([item({ price: 100, quantity: 1 })]);

    // Act + Assert
    expect(computeRevisedTotal(priced, 50, 12)).toBe(162);
  });

  it("treats an absent fee as zero rather than NaN", () => {
    // Arrange
    const priced = priceRevisedItems([item({ price: 100, quantity: 1 })]);

    // Act + Assert
    expect(computeRevisedTotal(priced, undefined, undefined)).toBe(100);
  });

  it("rounds the total to centavos", () => {
    // Arrange
    const priced = priceRevisedItems([
      item({ price: 0.1, quantity: 1 }),
      item({ price: 0.2, quantity: 1 }),
    ]);

    // Act + Assert
    expect(computeRevisedTotal(priced)).toBe(0.3);
  });
});

describe("countRevisedItems", () => {
  it("counts units, not lines", () => {
    // Arrange: `itemCount` drives the "3 items" badge on every order list. It
    // has to follow the edit, or the queue keeps showing the pre-edit count.
    const priced = priceRevisedItems([
      item({ quantity: 2 }),
      item({ menuItemId: "menu-2", quantity: 3 }),
    ]);

    // Act + Assert
    expect(countRevisedItems(priced)).toBe(5);
  });
});

describe("normalizePaymentAmount", () => {
  it("rounds a settlement to centavos", () => {
    expect(normalizePaymentAmount(150.005)).toBe(150.01);
  });

  it("refuses a non-positive amount", () => {
    // The amount is stored unsigned and `kind` carries the direction, so a
    // negative refund amount would double-negate and credit the customer twice.
    expect(() => normalizePaymentAmount(0)).toThrow(/positive/i);
    expect(() => normalizePaymentAmount(-5)).toThrow(/positive/i);
  });

  it("refuses a non-finite amount", () => {
    expect(() => normalizePaymentAmount(Number.NaN)).toThrow(/positive/i);
    expect(() => normalizePaymentAmount(Number.POSITIVE_INFINITY)).toThrow(/positive/i);
  });
});

describe("netAmountPaid", () => {
  function row(overrides: Partial<LedgerRowLike> = {}): LedgerRowLike {
    return { kind: "charge", amount: 100, ...overrides };
  }

  it("nets charges against refunds", () => {
    // Act
    const paid = netAmountPaid([row({ amount: 150 }), row({ kind: "refund", amount: 40 })]);

    // Assert
    expect(paid).toBe(110);
  });

  it("reports an unpaid order as zero, not undefined", () => {
    expect(netAmountPaid([])).toBe(0);
  });

  it("rounds away float drift so the cache never disagrees with the ledger", () => {
    // Arrange: this cache is what the edit screen compares against the total to
    // decide "collect, refund, or settled". A cent of drift asks a cashier for
    // money that is not owed.
    const paid = netAmountPaid([row({ amount: 0.1 }), row({ amount: 0.2 })]);

    // Assert
    expect(paid).toBe(0.3);
  });

  it("goes negative when refunds exceed charges rather than clamping", () => {
    // Over-refunding is a real error a merchant must be able to see.
    expect(netAmountPaid([row({ amount: 50 }), row({ kind: "refund", amount: 80 })])).toBe(-30);
  });

  it("ignores a non-finite row instead of poisoning the whole cache", () => {
    // Act
    const paid = netAmountPaid([row({ amount: 100 }), row({ amount: Number.NaN })]);

    // Assert
    expect(paid).toBe(100);
  });
});
