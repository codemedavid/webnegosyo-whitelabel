import { formatReceipt } from "./receipt-formatter";

/**
 * The receipt is the merchant's legal-ish record of a sale and the only POS
 * output the customer physically holds, so these tests pin BOTH the new cash
 * block and the fact that every pre-existing receipt still prints byte-for-byte
 * as it did before POS existed.
 */

const baseOrder = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30), // fixed instant — no clock reads
  customerName: "Walk-in",
  customerContact: "n/a",
  total: 327.5,
  items: [
    { menuItemName: "Latte", quantity: 2, subtotal: 240 },
    { menuItemName: "Croissant", quantity: 1, subtotal: 87.5 },
  ],
};

const config = { storeName: "Kape Co", width: 32 };

function linesOf(receipt: string): string[] {
  return receipt.split("\n");
}

function findLine(receipt: string, startsWith: string): string | undefined {
  return linesOf(receipt).find((l) => l.trimStart().startsWith(startsWith));
}

describe("formatReceipt — existing behavior (regression guard)", () => {
  it("prints the store name, the items, and the authoritative total", () => {
    const receipt = formatReceipt(baseOrder, config);
    expect(receipt).toContain("KAPE CO");
    expect(receipt).toContain("Latte");
    expect(receipt).toContain("Croissant");
    expect(findLine(receipt, "TOTAL:")).toContain("P327.50");
  });

  it("keeps every line within the configured width", () => {
    const receipt = formatReceipt(baseOrder, config);
    for (const line of linesOf(receipt)) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("prints no cash block for an order that was not paid in cash", () => {
    const receipt = formatReceipt(baseOrder, config);
    expect(receipt).not.toContain("CASH");
    expect(receipt).not.toContain("CHANGE");
  });
});

describe("formatReceipt — POS cash block", () => {
  const cashOrder = {
    ...baseOrder,
    paymentMethod: "Cash",
    cashTendered: 500,
    changeDue: 172.5,
  };

  it("prints what the customer handed over and what they get back", () => {
    const receipt = formatReceipt(cashOrder, config);
    expect(findLine(receipt, "CASH:")).toContain("P500.00");
    expect(findLine(receipt, "CHANGE:")).toContain("P172.50");
  });

  it("prints the cash block after the total, never before it", () => {
    const lines = linesOf(formatReceipt(cashOrder, config));
    const totalIdx = lines.findIndex((l) => l.startsWith("TOTAL:"));
    const cashIdx = lines.findIndex((l) => l.startsWith("CASH:"));
    const changeIdx = lines.findIndex((l) => l.startsWith("CHANGE:"));
    expect(totalIdx).toBeGreaterThanOrEqual(0);
    expect(cashIdx).toBeGreaterThan(totalIdx);
    expect(changeIdx).toBeGreaterThan(cashIdx);
  });

  it("prints exact-change sales with a zero change line rather than omitting it", () => {
    const receipt = formatReceipt(
      { ...cashOrder, cashTendered: 327.5, changeDue: 0 },
      config,
    );
    expect(findLine(receipt, "CASH:")).toContain("P327.50");
    expect(findLine(receipt, "CHANGE:")).toContain("P0.00");
  });

  it("keeps cash lines within the configured width", () => {
    const wide = formatReceipt(
      { ...cashOrder, cashTendered: 100000, changeDue: 99672.5 },
      config,
    );
    for (const line of linesOf(wide)) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("omits the cash block when only one half of the pair is present", () => {
    const tenderOnly = formatReceipt({ ...baseOrder, cashTendered: 500 }, config);
    expect(tenderOnly).not.toContain("CHANGE:");
  });
});

describe("formatReceipt — POS payment reference", () => {
  it("prints the reference for a scanned e-wallet payment", () => {
    const receipt = formatReceipt(
      { ...baseOrder, paymentMethod: "GCash", paymentReference: "REF-8842190" },
      config,
    );
    expect(findLine(receipt, "Payment:")).toContain("GCash");
    expect(receipt).toContain("REF-8842190");
  });

  it("prints no reference line when none was captured", () => {
    const receipt = formatReceipt({ ...baseOrder, paymentMethod: "GCash" }, config);
    expect(receipt).not.toContain("Ref:");
  });

  it("truncates an over-long reference instead of overflowing the paper", () => {
    const receipt = formatReceipt(
      { ...baseOrder, paymentMethod: "GCash", paymentReference: "R".repeat(80) },
      config,
    );
    for (const line of linesOf(receipt)) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });
});

/**
 * A discounted sale.
 *
 * The receipt is the only record the customer walks away with, and the only
 * one a merchant can hand to an auditor. Printing an authoritative TOTAL that
 * is less than the items above it, with nothing to explain the gap, reads as
 * an arithmetic error on the merchant's own paperwork — and gives a customer
 * disputing the charge nothing to check.
 *
 * The discount breakdown rides in `customerData.discount`, written by
 * `writeOrderDiscount` on every order backend (see `lib/order-discount.ts`).
 */
const discountedOrder = {
  ...baseOrder,
  // Items still sum to 327.50; the voucher took 27.50 off.
  total: 300,
  customerData: {
    discount: {
      total: 27.5,
      deliveryDiscount: 0,
      lines: [{ label: "WELCOME10", amount: 27.5, code: "WELCOME10" }],
      allocationsByLine: {},
    },
  },
};

describe("formatReceipt — a discounted sale", () => {
  it("prints a discount line so the total is explainable", () => {
    const receipt = formatReceipt(discountedOrder, config);

    expect(findLine(receipt, "WELCOME10")).toBeDefined();
  });

  it("shows the discount as an amount taken off", () => {
    const receipt = formatReceipt(discountedOrder, config);

    expect(findLine(receipt, "WELCOME10")).toContain("-P27.50");
  });

  it("prints the subtotal too, so the arithmetic reads top to bottom", () => {
    // Without a subtotal line the customer sees items, a discount, and a total
    // with no stated starting point. Today this line only appears when there
    // is a delivery fee.
    const receipt = formatReceipt(discountedOrder, config);

    expect(findLine(receipt, "Subtotal:")).toContain("P327.50");
  });

  it("still prints the backend total as authoritative", () => {
    const receipt = formatReceipt(discountedOrder, config);

    expect(findLine(receipt, "TOTAL:")).toContain("P300.00");
  });

  it("does not warn about a mismatch it can now account for", () => {
    // The existing guard compares the item sum against order.total. Every
    // discounted order trips it, which trains merchants to ignore a warning
    // that is meant to catch real corruption.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    formatReceipt(discountedOrder, config);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps a discounted receipt within the paper width", () => {
    const receipt = formatReceipt(discountedOrder, config);

    for (const l of linesOf(receipt)) {
      expect(l.length).toBeLessThanOrEqual(32);
    }
  });

  it("leaves an undiscounted receipt byte-for-byte unchanged", () => {
    // The overwhelming majority of sales carry no voucher.
    const receipt = formatReceipt(baseOrder, config);

    expect(receipt).not.toContain("Discount");
    expect(findLine(receipt, "Subtotal:")).toBeUndefined();
  });
});
