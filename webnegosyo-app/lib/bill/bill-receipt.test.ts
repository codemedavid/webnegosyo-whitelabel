import { CLASSIC_RECEIPT_LAYOUT, MODERN_RECEIPT_LAYOUT, flattenReceiptMarkup, renderReceipt } from "../receipt-layout";
import { billTitle, evenShareReceipt, itemPartReceipt, wholeBillReceipt } from "./bill-receipt";
import { billUnits, itemParts } from "./bill-split";
import { ROUND_ONE, ROUND_TWO, billOrder } from "./bill-fixtures";

const NOW = 1_700_001_000_000;
const config = { storeName: "Kape Co", width: 32 };
const print = (receipt: Parameters<typeof renderReceipt>[0], layout = MODERN_RECEIPT_LAYOUT) =>
  flattenReceiptMarkup(renderReceipt(receipt, config, layout), 32);

describe("billTitle", () => {
  it("names a table's bill by its table, a lone order by its number, else by count", () => {
    expect(billTitle([ROUND_ONE, ROUND_TWO])).toBe("Table 4");
    expect(billTitle([billOrder({ _id: "x", dailyNumber: 7 })])).toBe("Order #07");
    expect(billTitle([billOrder({ _id: "x" }), billOrder({ _id: "y" })])).toBe("2 orders");
  });
});

describe("wholeBillReceipt", () => {
  const receipt = wholeBillReceipt([ROUND_TWO, ROUND_ONE], { nowMs: NOW });

  it("totals every order and lists each dish once", () => {
    expect(receipt.total).toBe(560);
    expect(receipt.serviceCharge).toBe(20);
    expect(receipt.items?.find((i) => i.menuItemName === "Latte")?.quantity).toBe(3);
  });

  it("prints as one bill naming the orders it covers and what is still due", () => {
    const text = print(receipt);

    expect(text).toContain("Bill · Table 4");
    expect(text).toContain("Orders: #12, #15");
    expect(text).toMatch(/TOTAL\s+P560\.00/);
    expect(text).toMatch(/Amount due\s+P560\.00/);
  });

  it("carries every order's discount, merged by name", () => {
    const withDiscounts = [ROUND_ONE, ROUND_TWO].map((order) => ({
      ...order,
      total: order.total - 10,
      customerData: { ...(order.customerData as object), discount: { total: 10, lines: [{ label: "SUKI", amount: 10 }] } },
    }));

    const text = print(wholeBillReceipt(withDiscounts, { nowMs: NOW }), CLASSIC_RECEIPT_LAYOUT);

    expect(text).toMatch(/SUKI\s+-P20\.00/);
  });

  it("never reprints a single order's stored cash and change on a combined bill", () => {
    const paid = { ...ROUND_ONE, customerData: { table_number: "4", pos: { cashTendered: 500, changeDue: 160 } } };

    const text = print(wholeBillReceipt([paid, ROUND_TWO], { nowMs: NOW }), CLASSIC_RECEIPT_LAYOUT);

    expect(text).not.toContain("CASH:");
  });
});

describe("evenShareReceipt", () => {
  it("prints the whole bill with this guest's share and what this guest owes", () => {
    const receipt = evenShareReceipt([ROUND_ONE, ROUND_TWO], {
      nowMs: NOW,
      index: 0,
      count: 3,
      shareCents: 18667,
      paidCents: 0,
      isShareOfBalance: false,
    });

    const text = print(receipt);

    expect(text).toContain("Table 4 · Guest 1 of 3");
    expect(text).toMatch(/Your share \(1 of 3\)\s+P186\.67/);
    expect(text).toMatch(/Amount due\s+P186\.67/);
  });
});

describe("itemPartReceipt", () => {
  it("prints only the guest's own items with their slice of the charges", () => {
    const units = billUnits([ROUND_ONE, ROUND_TWO]);
    const cake = units.find((u) => u.item.menuItemName === "Cake");
    const { parts } = itemParts(units, { [cake!.id]: 1 }, 2);

    const receipt = itemPartReceipt([ROUND_ONE, ROUND_TWO], parts[1], {
      nowMs: NOW,
      count: 2,
      paidCents: 8800,
    });
    const text = print(receipt);

    expect(receipt.total).toBe(88);
    expect(text).toContain("Table 4 · Guest 2 of 2");
    expect(text).toContain("Cake");
    expect(text).not.toContain("Latte");
    expect(text).toMatch(/Service charge\s+P8\.00/);
    expect(text).toMatch(/Paid\s+P88\.00/);
    expect(text).toContain("Orders: #15");
  });
});
