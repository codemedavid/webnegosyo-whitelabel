/**
 * What a receipt says about the money: the discount, the cash handed over,
 * the change, what has been paid and what is still owed.
 *
 * A register sale used to print its cash and change only at the moment of the
 * sale. A reprint from the order screen hands the printer the STORED order,
 * where the register keeps the tender in `customerData.pos`. The engine only
 * read the top-level fields, so every reprint lost its cash and change.
 */
import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  flattenReceiptMarkup,
  renderReceipt,
  type ReceiptLayout,
  type ReceiptOrder,
} from "./receipt-layout";

const config = { storeName: "Kape Co", width: 32 };

const baseOrder: ReceiptOrder = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: "Maria",
  customerContact: "09171234567",
  total: 460,
  paymentMethod: "Cash",
  items: [
    { menuItemName: "Latte", quantity: 2, subtotal: 240 },
    { menuItemName: "Croissant", quantity: 2, subtotal: 260 },
  ],
  customerData: {
    discount: { total: 40, deliveryDiscount: 0, lines: [{ label: "SUKI10", amount: 40 }] },
  },
};

function print(order: ReceiptOrder, layout: ReceiptLayout = CLASSIC_RECEIPT_LAYOUT): string {
  return flattenReceiptMarkup(renderReceipt(order, config, layout), config.width);
}

describe("cash and change on a reprint", () => {
  const storedSale: ReceiptOrder = {
    ...baseOrder,
    customerData: {
      ...(baseOrder.customerData as Record<string, unknown>),
      pos: { cashTendered: 500, changeDue: 40, cashierId: "u1" },
    },
  };

  it("reads the register's stored tender when the order carries no top-level cash", () => {
    const text = print(storedSale);

    expect(text).toMatch(/CASH:\s+P500\.00/);
    expect(text).toMatch(/CHANGE:\s+P40\.00/);
  });

  it("reads the snake_case blob a Postgres row carries", () => {
    const { customerData, ...rest } = storedSale;
    const text = print({ ...rest, customer_data: customerData });

    expect(text).toMatch(/CHANGE:\s+P40\.00/);
  });

  it("prints the discount, the cash and the change on one Modern receipt", () => {
    const text = print(storedSale, MODERN_RECEIPT_LAYOUT);

    expect(text).toMatch(/SUKI10\s+-P40\.00/);
    expect(text).toMatch(/Cash\s+P500\.00/);
    expect(text).toMatch(/Change\s+P40\.00/);
  });

  it("prefers the tender handed over at print time over the stored one", () => {
    const text = print({ ...storedSale, cashTendered: 1000, changeDue: 540 });

    expect(text).toMatch(/CASH:\s+P1000\.00/);
    expect(text).not.toMatch(/CASH:\s+P500\.00/);
  });

  it("prints the stored wallet reference on a reprint", () => {
    const text = print({
      ...baseOrder,
      paymentMethod: "GCash",
      customerData: { pos: { reference: "GC-778812" } },
    });

    expect(text).toContain("Ref: GC-778812");
  });

  it("drops a stored tender that no longer squares with an edited order's total", () => {
    const text = print({ ...storedSale, total: 610 });

    expect(text).not.toContain("CASH:");
    expect(text).not.toContain("CHANGE:");
  });

  it("ignores a malformed stored tender", () => {
    const text = print({ ...baseOrder, customerData: { pos: { cashTendered: "500", changeDue: 40 } } });

    expect(text).not.toContain("CASH:");
  });
});

describe("paid and balance lines", () => {
  it("prints nothing about settlement when the caller does not know what was paid", () => {
    const text = print(baseOrder);

    expect(text).not.toMatch(/PAID|DUE/);
  });

  it("prints Amount due on an unpaid bill", () => {
    const text = print({ ...baseOrder, amountPaid: 0 });

    expect(text).toMatch(/AMOUNT DUE:\s+P460\.00/);
    expect(text).not.toContain("PAID:");
  });

  it("prints Paid and Balance due on a part-paid bill", () => {
    const text = print({ ...baseOrder, amountPaid: 300 }, MODERN_RECEIPT_LAYOUT);

    expect(text).toMatch(/Paid\s+P300\.00/);
    expect(text).toMatch(/Balance due\s+P160\.00/);
  });

  it("prints Paid on a wallet sale settled in full", () => {
    const text = print({ ...baseOrder, paymentMethod: "GCash", amountPaid: 460 });

    expect(text).toMatch(/PAID:\s+P460\.00/);
    expect(text).not.toContain("DUE");
  });

  it("does not repeat a cash sale's settlement under its cash and change", () => {
    const text = print({ ...baseOrder, cashTendered: 500, changeDue: 40, amountPaid: 460 });

    expect(text).toMatch(/CHANGE:\s+P40\.00/);
    expect(text).not.toContain("PAID:");
  });
});

describe("bills over several orders and split parts", () => {
  it("prints the bill heading where the order number goes, on both themes", () => {
    const bill = { ...baseOrder, bill: { heading: "Table 4 bill" } };

    expect(print(bill)).toContain("Table 4 bill");
    expect(print(bill)).not.toContain("1234567890".slice(-8).toUpperCase());
    expect(print(bill, MODERN_RECEIPT_LAYOUT)).toContain("Table 4 bill");
  });

  it("lists the orders a combined bill covers", () => {
    const text = print({ ...baseOrder, bill: { heading: "Table 4 bill", orderRefs: ["#12", "#15"] } });

    expect(text).toContain("Orders: #12, #15");
  });

  it("prints a guest's share under the full total and settles against the share", () => {
    const text = print(
      {
        ...baseOrder,
        amountPaid: 0,
        bill: { heading: "Guest 1 of 2", share: { label: "Your share (1 of 2)", amount: 230 } },
      },
      MODERN_RECEIPT_LAYOUT,
    );

    expect(text).toMatch(/TOTAL\s+P460\.00/);
    expect(text).toMatch(/Your share \(1 of 2\)\s+P230\.00/);
    expect(text).toMatch(/Amount due\s+P230\.00/);
  });
});
