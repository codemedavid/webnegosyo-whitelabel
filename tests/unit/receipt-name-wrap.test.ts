import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  renderReceipt,
  type ReceiptOrder,
} from "@/lib/receipt-layout";

/**
 * A merchant's item names are not budgeted to the paper width. Clipping one to
 * protect the price column loses the only thing the customer reads to check
 * their order, so a long name wraps onto continuation lines instead — nothing
 * on the name is ever cut.
 */

const W = 32;
const config = { storeName: "Kape Co", width: W };

const LONG_NAME = "Double Chocolate Chip Frappuccino Grande with Extra Whipped Cream";

function orderWith(items: ReceiptOrder["items"]): ReceiptOrder {
  return {
    _id: "abcdef1234567890",
    _creationTime: Date.UTC(2026, 6, 26, 4, 30),
    customerName: "Walk-in",
    customerContact: "n/a",
    total: items!.reduce((sum, item) => sum + item.subtotal, 0),
    items,
  };
}

/**
 * The receipt as one space-collapsed string with the amount column removed, so
 * a name broken across lines reads back as the name the merchant typed.
 */
function nameColumn(receipt: string): string {
  return receipt
    .replace(/<\/?[A-Z]>/g, "")
    .replace(/P\d+\.\d{2}/g, "")
    .replace(/\s+/g, " ");
}

describe.each([
  ["Classic", CLASSIC_RECEIPT_LAYOUT],
  ["Modern", MODERN_RECEIPT_LAYOUT],
])("%s preset — long item names wrap instead of being cut", (_name, layout) => {
  const receipt = renderReceipt(orderWith([{ menuItemName: LONG_NAME, quantity: 2, subtotal: 240 }]), config, layout);

  it("prints the name whole, with only line breaks between the words", () => {
    expect(nameColumn(receipt)).toContain(LONG_NAME);
  });

  it("keeps the price on the first line of the item", () => {
    const first = receipt.split("\n").find((line) => line.includes("Double"));
    expect(first).toContain("P240.00");
  });

  it("never exceeds the paper width", () => {
    for (const line of receipt.split("\n")) {
      expect(line.replace(/<\/?[A-Z]>/g, "").length).toBeLessThanOrEqual(W);
    }
  });

  it("indents the continuation lines under the name column", () => {
    const lines = receipt.split("\n");
    const firstIndex = lines.findIndex((line) => line.includes("Double"));
    const continuation = lines[firstIndex + 1];
    expect(continuation).toMatch(/^ +\S/);
  });
});

describe("wrapping does not disturb names that already fit", () => {
  it("prints a short name on a single line with its price", () => {
    const receipt = renderReceipt(
      orderWith([{ menuItemName: "Latte", quantity: 2, subtotal: 240 }]),
      config,
      CLASSIC_RECEIPT_LAYOUT
    );
    const latteLines = receipt.split("\n").filter((line) => line.includes("Latte"));
    expect(latteLines).toHaveLength(1);
    expect(latteLines[0]).toContain("P240.00");
  });
});

describe("an unbroken word longer than the paper is hard-split, not dropped", () => {
  it("prints all of it across lines", () => {
    const monster = "Z".repeat(80);
    const receipt = renderReceipt(
      orderWith([{ menuItemName: monster, quantity: 1, subtotal: 10 }]),
      config,
      CLASSIC_RECEIPT_LAYOUT
    );
    const printedAs = receipt
      .split("\n")
      .filter((line) => line.includes("Z"))
      .join("")
      .replace(/[^Z]/g, "");
    expect(printedAs.length).toBe(80);
  });
});

describe("bundle names wrap too", () => {
  it("prints the whole bundle name", () => {
    const bundleName = "Family Feast Sharing Platter for Six Hungry People";
    const receipt = renderReceipt(
      orderWith([
        {
          menuItemName: "Latte",
          quantity: 1,
          subtotal: 120,
          isBundleItem: true,
          bundleId: "b1",
          bundleName,
        },
      ]),
      config,
      CLASSIC_RECEIPT_LAYOUT
    );
    const flattened = receipt.replace(/\n/g, " ").replace(/\s+/g, " ");
    for (const word of bundleName.split(" ")) {
      expect(flattened).toContain(word);
    }
  });
});
