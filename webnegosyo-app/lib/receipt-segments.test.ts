import {
  CLASSIC_RECEIPT_LAYOUT,
  DETAILED_RECEIPT_LAYOUT,
  renderReceipt,
  renderReceiptSegments,
} from "./receipt-layout";

/**
 * A receipt with a QR can't travel to the printer as one string — the QR is a
 * raster sent through printImageBase64 while everything else goes through
 * printBill. `renderReceiptSegments` is the split: contiguous text collapses
 * into single segments (fewest BLE round trips) and each QR becomes its own
 * segment, in layout order.
 */

const order = {
  _id: "abcdef1234567890",
  _creationTime: Date.UTC(2026, 6, 26, 4, 30),
  customerName: "Walk-in",
  customerContact: "n/a",
  total: 327.5,
  items: [{ menuItemName: "Latte", quantity: 2, subtotal: 327.5 }],
};

const config = { storeName: "Kape Co", width: 32 };
const TRACK_URL = "https://kape.example.com/kape/order/abc?t=deadbeef";

describe("renderReceiptSegments", () => {
  it("returns one text segment matching renderReceipt when there is no QR", () => {
    const segments = renderReceiptSegments(order, config, CLASSIC_RECEIPT_LAYOUT);
    expect(segments).toEqual([
      { type: "text", text: renderReceipt(order, config, CLASSIC_RECEIPT_LAYOUT) },
    ]);
  });

  it("splits a QR into its own segment between merged text segments", () => {
    const segments = renderReceiptSegments(
      order,
      { ...config, trackingUrl: TRACK_URL },
      {
        version: 1,
        blocks: [
          { kind: "businessName" },
          { kind: "totals" },
          { kind: "qr" },
          { kind: "text", text: "Thank you!", align: "center" },
        ],
      },
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]?.type).toBe("text");
    expect(segments[1]).toEqual({ type: "qr", data: TRACK_URL });
    expect(segments[2]?.type).toBe("text");
    expect((segments[0] as { text: string }).text).toContain("Scan to track your order");
    expect((segments[2] as { text: string }).text).toContain("Thank you!");
  });

  it("emits no qr segment when the config has no tracking URL", () => {
    const segments = renderReceiptSegments(order, config, DETAILED_RECEIPT_LAYOUT);
    expect(segments.every((s) => s.type === "text")).toBe(true);
  });

  it("keeps renderReceipt as the exact text fallback (URL line where the QR sits)", () => {
    const flat = renderReceipt(
      order,
      { ...config, trackingUrl: TRACK_URL },
      { version: 1, blocks: [{ kind: "qr" }] },
    );
    expect(flat).toContain(TRACK_URL); // scanner-less phones can still type it
  });
});
