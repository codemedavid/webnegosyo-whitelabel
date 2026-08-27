import { formatReceipt } from "./receipt-formatter";
import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  parseReceiptLayout,
  renderReceipt,
  resolveReceiptLayout,
} from "./receipt-layout";

/**
 * The layout engine is what lets a tenant rearrange their receipt. Its one
 * non-negotiable guarantee is that the Classic preset prints byte-for-byte
 * what `formatReceipt` has always printed — every live tenant is on Classic
 * until they publish a custom layout.
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

const cashOrder = {
  ...baseOrder,
  paymentMethod: "Cash",
  cashTendered: 500,
  changeDue: 172.5,
};

const discountedOrder = {
  ...baseOrder,
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

const config = { storeName: "Kape Co", width: 32 };

function linesOf(receipt: string): string[] {
  return receipt.split("\n");
}

describe("renderReceipt — Classic preset regression lock", () => {
  it("prints the base order byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(baseOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(baseOrder, config),
    );
  });

  it("prints a POS cash sale byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(cashOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(cashOrder, config),
    );
  });

  it("prints a discounted sale byte-for-byte like formatReceipt", () => {
    expect(renderReceipt(discountedOrder, config, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(discountedOrder, config),
    );
  });

  it("prints a bundle + address receipt byte-for-byte like formatReceipt", () => {
    const bundleOrder = {
      ...baseOrder,
      total: 546.5,
      items: [
        ...baseOrder.items,
        {
          menuItemName: "Burger",
          quantity: 1,
          subtotal: 120,
          isBundleItem: true,
          bundleId: "b1",
          bundleName: "Meal Deal",
          slotName: "Main",
          addons: [{ name: "Cheese", price: 15 }],
        },
        {
          menuItemName: "Fries",
          quantity: 1,
          subtotal: 99,
          isBundleItem: true,
          bundleId: "b1",
          bundleName: "Meal Deal",
          variation: "Large",
          specialInstructions: "Extra salt",
        },
      ],
    };
    const withAddress = { ...config, storeAddress: "12 Mabini St" };
    expect(renderReceipt(bundleOrder, withAddress, CLASSIC_RECEIPT_LAYOUT)).toBe(
      formatReceipt(bundleOrder, withAddress),
    );
  });
});

describe("renderReceipt — custom block arrangements", () => {
  it("renders blocks in the order the layout says, not a fixed order", () => {
    const lines = linesOf(
      renderReceipt(baseOrder, config, {
        version: 1,
        blocks: [
          { kind: "text", text: "Thanks for coming!", align: "center" },
          { kind: "businessName" },
        ],
      }),
    );
    const thanksIdx = lines.findIndex((l) => l.includes("Thanks for coming!"));
    const nameIdx = lines.findIndex((l) => l.includes("KAPE CO"));
    expect(thanksIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeGreaterThan(thanksIdx);
  });

  it("aligns text blocks left, center, and right", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      blocks: [
        { kind: "text", text: "left", align: "left" },
        { kind: "text", text: "mid", align: "center" },
        { kind: "text", text: "right", align: "right" },
      ],
    });
    const lines = linesOf(receipt);
    expect(lines[0]).toBe("left");
    expect(lines[1]).toBe(" ".repeat(Math.floor((32 - 3) / 2)) + "mid");
    expect(lines[2]).toBe(" ".repeat(32 - 5) + "right");
  });

  it("summarizes items as a count when the layout asks for itemsSummary", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      blocks: [{ kind: "itemsSummary" }],
    });
    expect(receipt).toContain("Items: 3"); // 2 lattes + 1 croissant
    expect(receipt).not.toContain("Latte");
  });

  it("prints the customer contact for a contact block, but never a placeholder", () => {
    const withPhone = renderReceipt(
      { ...baseOrder, customerContact: "09171234567" },
      config,
      { version: 1, blocks: [{ kind: "contact" }] },
    );
    expect(withPhone).toContain("Contact: 09171234567");

    const placeholder = renderReceipt(baseOrder, config, {
      version: 1,
      blocks: [{ kind: "contact" }],
    });
    expect(placeholder).not.toContain("Contact:");
  });

  it("prints a tracking link for a qr block when the config carries one", () => {
    const receipt = renderReceipt(baseOrder, config, {
      version: 1,
      blocks: [{ kind: "qr" }],
    });
    expect(receipt).toBe(""); // no tracking URL configured → block is silent

    const withUrl = renderReceipt(
      baseOrder,
      { ...config, trackingUrl: "https://kape.co/t/ABC123" },
      { version: 1, blocks: [{ kind: "qr" }] },
    );
    expect(withUrl).toContain("Scan to track your order");
    expect(withUrl).toContain("https://kape.co/t/ABC123");
  });

  it("keeps every custom-layout line within the paper width", () => {
    const receipt = renderReceipt(
      { ...baseOrder, customerContact: "0".repeat(60) },
      { ...config, trackingUrl: "https://example.com/" + "x".repeat(80) },
      {
        version: 1,
        blocks: [
          { kind: "businessName" },
          { kind: "text", text: "y".repeat(90), align: "center" },
          { kind: "contact" },
          { kind: "qr" },
          { kind: "items" },
          { kind: "totals" },
        ],
      },
    );
    for (const l of linesOf(receipt)) {
      expect(l.length).toBeLessThanOrEqual(32);
    }
  });
});

describe("built-in presets", () => {
  it("Compact still prints the items and the authoritative total", () => {
    const receipt = renderReceipt(baseOrder, config, COMPACT_RECEIPT_LAYOUT);
    expect(receipt).toContain("Latte");
    expect(receipt).toContain("P327.50");
  });

  it("Detailed prints everything Classic does plus the contact line", () => {
    const receipt = renderReceipt(
      { ...baseOrder, customerContact: "09171234567" },
      config,
      DETAILED_RECEIPT_LAYOUT,
    );
    expect(receipt).toContain("KAPE CO");
    expect(receipt).toContain("Contact: 09171234567");
    expect(receipt).toContain("TOTAL:");
  });
});

describe("parseReceiptLayout — untrusted tenant JSON", () => {
  it("accepts a valid layout", () => {
    const parsed = parseReceiptLayout({
      version: 1,
      blocks: [{ kind: "businessName" }, { kind: "items" }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.blocks).toHaveLength(2);
  });

  it("rejects garbage, wrong versions, and unknown block kinds", () => {
    expect(parseReceiptLayout(null)).toBeNull();
    expect(parseReceiptLayout("classic")).toBeNull();
    expect(parseReceiptLayout({ version: 2, blocks: [] })).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "explode" }] }),
    ).toBeNull();
    expect(
      parseReceiptLayout({ version: 1, blocks: [{ kind: "text" }] }),
    ).toBeNull(); // text block without text
  });

  it("rejects an empty block list — a blank receipt is never intended", () => {
    expect(parseReceiptLayout({ version: 1, blocks: [] })).toBeNull();
  });
});

describe("resolveReceiptLayout — what the printer actually uses", () => {
  it("falls back to Classic when the tenant has no saved layout", () => {
    expect(resolveReceiptLayout(null)).toBe(CLASSIC_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout(undefined)).toBe(CLASSIC_RECEIPT_LAYOUT);
  });

  it("falls back to Classic when the saved layout is invalid", () => {
    expect(resolveReceiptLayout({ version: 99 })).toBe(CLASSIC_RECEIPT_LAYOUT);
  });

  it("resolves preset names so a tenant row can store just a string", () => {
    expect(resolveReceiptLayout("compact")).toBe(COMPACT_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout("detailed")).toBe(DETAILED_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout("classic")).toBe(CLASSIC_RECEIPT_LAYOUT);
  });

  it("uses a valid saved custom layout as-is", () => {
    const custom = { version: 1, blocks: [{ kind: "businessName" as const }] };
    const resolved = resolveReceiptLayout(custom);
    expect(resolved.blocks).toHaveLength(1);
    expect(resolved.blocks[0]?.kind).toBe("businessName");
  });
});
