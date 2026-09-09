/**
 * The Modern theme: the same blocks, styled. A merchant's saved layout gets
 * a `theme`; absent means Modern, so every store moves off the flat slip
 * unless it opted into Classic — and `classic` stays byte-for-byte.
 */

import {
  CLASSIC_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  flattenReceiptMarkup,
  stripReceiptMarkup,
  parseReceiptLayout,
  renderReceipt,
  renderReceiptSegments,
  resolveReceiptLayout,
  resolveReceiptTheme,
  type ReceiptLayout,
} from "./receipt-layout";
import { formatReceipt } from "./receipt-formatter";

const order = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: "Maria",
  customerContact: "09171234567",
  orderType: "Dine-in",
  customerData: { table_number: "4" },
  total: 327.5,
  paymentMethod: "Cash",
  cashTendered: 500,
  changeDue: 172.5,
  items: [
    { menuItemName: "Latte", quantity: 2, subtotal: 240, variation: "Large" },
    {
      menuItemName: "Croissant",
      quantity: 1,
      subtotal: 87.5,
      addons: [{ name: "Butter", price: 0 }],
      specialInstructions: "warm",
    },
  ],
};

const config = { storeName: "Kape Co", width: 32 };

const text = (layout: ReceiptLayout) =>
  renderReceiptSegments(order, { ...config, trackingUrl: "https://x.y/o?t=1" }, layout)
    .filter((s): s is { type: "text"; text: string } => s.type === "text")
    .map((s) => s.text)
    .join("\n");

describe("theme resolution", () => {
  it("reads an absent theme as modern and an explicit one as itself", () => {
    expect(resolveReceiptTheme({ version: 1, blocks: [{ kind: "items" }] })).toBe("modern");
    expect(resolveReceiptTheme({ version: 1, theme: "classic", blocks: [] })).toBe("classic");
  });

  it("the Classic preset is pinned to the classic theme", () => {
    expect(CLASSIC_RECEIPT_LAYOUT.theme).toBe("classic");
  });

  it("parses a theme and rejects an unknown one", () => {
    expect(parseReceiptLayout({ version: 1, theme: "modern", blocks: [{ kind: "items" }] })?.theme).toBe("modern");
    expect(parseReceiptLayout({ version: 1, theme: "neon", blocks: [{ kind: "items" }] })).toBeNull();
  });

  it("a tenant with nothing saved now prints the Modern preset", () => {
    expect(resolveReceiptLayout(null)).toBe(MODERN_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout(undefined)).toBe(MODERN_RECEIPT_LAYOUT);
    expect(resolveReceiptLayout("modern")).toBe(MODERN_RECEIPT_LAYOUT);
  });

  it("an explicit classic choice still prints Classic byte-for-byte", () => {
    expect(resolveReceiptLayout("classic")).toBe(CLASSIC_RECEIPT_LAYOUT);
    expect(renderReceipt(order, config, CLASSIC_RECEIPT_LAYOUT)).toBe(formatReceipt(order, config));
  });
});

describe("modern rendering", () => {
  it("prints the store name centred, double size and bold", () => {
    expect(text(MODERN_RECEIPT_LAYOUT)).toContain("<C><W><B>KAPE CO</B></W></C>");
  });

  it("drops to double height when the name is too wide for double width", () => {
    const wide = renderReceiptSegments(
      order,
      { ...config, storeName: "The Longest Coffee House" },
      { version: 1, blocks: [{ kind: "businessName" }] },
    );
    expect(wide[0]).toEqual({ type: "text", text: "<C><H><B>THE LONGEST COFFEE HOUSE</B></H></C>" });
  });

  it("prints the order number as a centred tall headline and the details centred beneath", () => {
    const out = text(MODERN_RECEIPT_LAYOUT);
    expect(out).toContain("<C><H><B>Order #34567890</B></H></C>");
    expect(out).toContain("<C>Jul 26, 2026  12:30 PM</C>");
    expect(out).toContain("<C>Dine-in  ·  Table 4</C>");
    expect(out).toContain("<C>Customer: Maria</C>");
  });

  it("lists items as Nx name with the price flush right and modifiers indented", () => {
    const out = text(MODERN_RECEIPT_LAYOUT);
    expect(out).toContain("2x  Latte                P240.00");
    expect(out).toContain("    Large");
    expect(out).toContain("1x  Croissant             P87.50");
    expect(out).toContain("    + Butter");
    expect(out).toContain("    Note: warm");
    expect(out).not.toContain("Qty  Item");
  });

  it("prints the total as a tall bold line and the tender beneath it", () => {
    const out = text(MODERN_RECEIPT_LAYOUT);
    expect(out).toContain("<H><B>TOTAL                    P327.50</B></H>");
    expect(out).toContain("Payment                     Cash");
    expect(out).toContain("Cash                     P500.00");
    expect(out).toContain("Change                   P172.50");
  });

  it("labels the QR with a bold centred caption", () => {
    const segments = renderReceiptSegments(
      order,
      { ...config, trackingUrl: "https://x.y/o?t=1" },
      MODERN_RECEIPT_LAYOUT,
    );
    const qrIndex = segments.findIndex((s) => s.type === "qr");
    expect(qrIndex).toBeGreaterThan(0);
    const before = segments[qrIndex - 1];
    expect(before?.type === "text" && before.text.endsWith("<C><B>Scan to track your order</B></C>")).toBe(true);
  });

  it("keeps granular detail labels when a merchant renamed them", () => {
    const out = text({
      version: 1,
      blocks: [
        { kind: "orderNumber", label: "Ref" },
        { kind: "orderDate", label: "Placed" },
        { kind: "customerName", label: "Guest" },
      ],
    });
    expect(out).toContain("<C><H><B>Ref #34567890</B></H></C>");
    expect(out).toContain("<C>Placed: Jul 26, 2026  12:30 PM</C>");
    expect(out).toContain("<C>Customer: Maria</C>".replace("Customer", "Guest"));
  });

  it("the flat rendering carries no markup and honours centring with spaces", () => {
    const flat = renderReceipt(order, config, MODERN_RECEIPT_LAYOUT);
    expect(flat).not.toMatch(/<\/?[CRBHW]>/);
    expect(flat).toContain("            KAPE CO");
  });
});

describe("markup helpers", () => {
  it("stripReceiptMarkup removes only the receipt's own tags", () => {
    expect(stripReceiptMarkup("<C><B>Hi</B></C> <x>")).toBe("Hi <x>");
  });

  it("flattenReceiptMarkup pads centred and right-aligned lines to the width", () => {
    expect(flattenReceiptMarkup("<C>ab</C>\n<R>ab</R>\nab", 8)).toBe("   ab\n      ab\nab");
  });
});
