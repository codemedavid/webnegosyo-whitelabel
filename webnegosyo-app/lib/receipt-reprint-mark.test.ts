import {
  CLASSIC_RECEIPT_LAYOUT,
  COMPACT_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  MODERN_RECEIPT_LAYOUT,
  REPRINT_MARK,
  renderReceipt,
  renderReceiptBlocks,
  renderReceiptSegments,
  type ReceiptLayout,
} from "./receipt-layout";

/**
 * A copy printed again by hand says so — "*** REPRINT ***" and when, under the
 * order number — and changes nothing else. A first print (auto-print, the
 * register after a sale) carries no `reprint` and is byte-for-byte unchanged.
 */

const order = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 10, 4, 4, 30),
  customerName: "Walk-in",
  customerContact: "n/a",
  total: 327.5,
  paymentMethod: "Cash",
  items: [
    { menuItemName: "Latte", quantity: 2, subtotal: 240 },
    { menuItemName: "Croissant", quantity: 1, subtotal: 87.5 },
  ],
};
const REPRINT_AT = Date.UTC(2026, 10, 4, 9, 15);
const reprinted = { ...order, reprint: { at: REPRINT_AT } };
const config = { storeName: "Kape Co", width: 32 };

const PRESETS: [string, ReceiptLayout][] = [
  ["classic", CLASSIC_RECEIPT_LAYOUT],
  ["modern", MODERN_RECEIPT_LAYOUT],
  ["compact", COMPACT_RECEIPT_LAYOUT],
  ["detailed", DETAILED_RECEIPT_LAYOUT],
];

function lines(text: string): string[] {
  return text.split("\n");
}

describe("REPRINT mark", () => {
  it.each(PRESETS)("%s: prints the mark and when, right under the order number", (_name, layout) => {
    const out = lines(renderReceipt(reprinted, config, layout));
    const numberAt = out.findIndex((line) => line.includes("ABCDEF1234567890".slice(-8)));
    expect(numberAt).toBeGreaterThanOrEqual(0);
    expect(out[numberAt + 1]?.trim()).toBe(REPRINT_MARK);
    expect(out[numberAt + 2]).toMatch(/Reprinted .*2026/);
  });

  it.each(PRESETS)("%s: adds only the two mark lines — every number and figure stays", (_name, layout) => {
    const first = lines(renderReceipt(order, config, layout));
    const again = lines(renderReceipt(reprinted, config, layout));
    expect(again).toHaveLength(first.length + 2);
    const withoutMark = again.filter(
      (line) => line.trim() !== REPRINT_MARK && !/Reprinted /.test(line),
    );
    expect(withoutMark).toEqual(first);
  });

  it.each(PRESETS)("%s: a first print carries no mark", (_name, layout) => {
    const text = renderReceipt(order, config, layout);
    expect(text).not.toContain("REPRINT");
    expect(text).not.toContain("Reprinted");
  });

  it("is bold and centred on Modern, plain on Classic", () => {
    const modern = renderReceiptSegments(reprinted, config, MODERN_RECEIPT_LAYOUT)
      .map((s) => (s.type === "text" ? s.text : ""))
      .join("\n");
    expect(modern).toContain(`<C><B>${REPRINT_MARK}</B></C>`);
    const classic = renderReceiptSegments(reprinted, config, CLASSIC_RECEIPT_LAYOUT)
      .map((s) => (s.type === "text" ? s.text : ""))
      .join("\n");
    expect(classic).not.toMatch(/<[CRBHW]>/);
  });

  it("goes on top of a custom layout that has no order number", () => {
    const layout: ReceiptLayout = { version: 1, theme: "classic", blocks: [{ kind: "businessName" }, { kind: "items" }] };
    const out = lines(renderReceipt(reprinted, config, layout));
    expect(out[0]?.trim()).toBe(REPRINT_MARK);
  });

  it("follows a styled or renamed order number block too", () => {
    const layout: ReceiptLayout = {
      version: 1,
      blocks: [{ kind: "orderNumber", label: "Ticket", style: { size: "large" } }, { kind: "items" }],
    };
    const out = lines(renderReceipt(reprinted, config, layout));
    const numberAt = out.findIndex((line) => line.includes("34567890"));
    expect(out[numberAt + 1]?.trim()).toBe(REPRINT_MARK);
  });

  it("rides on the order-number block in the per-block render (the Studio map)", () => {
    const blocks = renderReceiptBlocks(reprinted, config, CLASSIC_RECEIPT_LAYOUT);
    const meta = blocks[CLASSIC_RECEIPT_LAYOUT.blocks.findIndex((b) => b.kind === "orderMeta")];
    expect(meta?.segments.some((s) => s.type === "text" && s.text.includes(REPRINT_MARK))).toBe(true);
  });

  it("ignores a garbled reprint time instead of printing NaN", () => {
    const text = renderReceipt({ ...order, reprint: { at: Number.NaN } }, config, CLASSIC_RECEIPT_LAYOUT);
    expect(text).not.toContain("REPRINT");
  });

  it("leaves the BIR permit footer exactly as it was", () => {
    const tax = {
      vatStatus: "vat" as const,
      tinLine: "VAT REG TIN 123-456-789-00000",
      registeredName: null,
      businessAddress: "24 Rizal St",
      isBirRegisteredPos: true,
      posMin: "MIN-1",
      posSerialNo: "SN-2",
      posPtuNo: "PTU-3",
    };
    const taxed = { ...config, tax };
    const first = lines(renderReceipt(order, taxed, CLASSIC_RECEIPT_LAYOUT));
    const again = lines(renderReceipt(reprinted, taxed, CLASSIC_RECEIPT_LAYOUT));
    const tail = (out: string[]) => out.slice(out.findIndex((line) => line.includes("MIN: MIN-1")));
    expect(tail(again)).toEqual(tail(first));
    expect(tail(first).join("\n")).toContain("PTU No: PTU-3");
  });
});
