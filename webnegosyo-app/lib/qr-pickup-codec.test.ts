/**
 * Pickup-ticket codec — React Native side.
 *
 * The load-bearing test here is CROSS_RUNTIME_PICKUP_QR: a literal string
 * produced by the WEB codec (src/lib/qr-order-codec.ts). The customer's phone
 * renders the QR from the web build and this app scans it, so if the two
 * implementations ever drift — a reordered checksum key, a renamed field —
 * every pickup scan in production fails. A round-trip test inside this file
 * alone would stay green through that drift. This one cannot.
 */

import {
  encodePickupQr,
  decodePickupQr,
  encodeOrderToQr,
  decodeQrToOrder,
  type QrPickupPayloadV1,
} from "./qr-order-codec";

/**
 * Emitted by the web codec for the payload in `basePickup` below.
 * Regenerate ONLY from src/lib/qr-order-codec.ts — never by pasting this
 * file's own output, which would defeat the purpose of the test.
 */
const CROSS_RUNTIME_PICKUP_QR =
  "N4IgbiBcCMA0IGsogA4EsDGCCuKTwBcBTAOwEMSCBJAE2WPMoFoyAjDfEAewCcaietZL348m0AEwBmTgS4JSyMspWq16jZq3atsqNADsABhOmzR+FmRTDNCRIxEQAXyA";

const basePickup: Omit<QrPickupPayloadV1, "ck"> = {
  v: 1,
  k: "pickup",
  tenantId: "tenant-abc",
  orderId: "order-123",
  token: "a".repeat(64),
  t: 1_700_000_000_000,
};

describe("pickup QR codec (React Native mirror)", () => {
  it("decodes a pickup ticket encoded by the web codec", () => {
    // Arrange / Act
    const result = decodePickupQr(CROSS_RUNTIME_PICKUP_QR);

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.orderId).toBe("order-123");
    expect(result.payload.tenantId).toBe("tenant-abc");
    expect(result.payload.token).toBe("a".repeat(64));
  });

  it("encodes byte-identically to the web codec", () => {
    // If this fails, the checksum key order or a field name has drifted.
    expect(encodePickupQr(basePickup)).toBe(CROSS_RUNTIME_PICKUP_QR);
  });

  it("round-trips a pickup ticket", () => {
    const result = decodePickupQr(encodePickupQr(basePickup));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.orderId).toBe("order-123");
  });

  it("reports empty for an empty string", () => {
    expect(decodePickupQr("")).toEqual({ ok: false, error: "empty" });
  });

  it("reports corrupt for a string that is not a compressed payload", () => {
    const result = decodePickupQr("!!!not-a-payload!!!");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("corrupt");
  });

  it("rejects a cart-handoff payload as not a pickup ticket", () => {
    const handoff = encodeOrderToQr({
      v: 1,
      cid: "cid-1",
      t: 1_700_000_000_000,
      tenantId: "tenant-abc",
      tenantSlug: "abc",
      orderTypeId: "ot-1",
      orderType: "pickup",
      customerName: "Ana",
      customerContact: "09171234567",
      customerData: {},
      items: [],
      total: 0,
    });

    const result = decodePickupQr(handoff);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("not_pickup");
  });

  it("does not decode a pickup ticket as a cart-handoff order", () => {
    const result = decodeQrToOrder(encodePickupQr(basePickup));

    expect(result.ok).toBe(false);
  });

  it("still decodes an existing cart-handoff payload unchanged", () => {
    const handoff = encodeOrderToQr({
      v: 1,
      cid: "cid-2",
      t: 1_700_000_000_000,
      tenantId: "tenant-abc",
      tenantSlug: "abc",
      orderTypeId: "ot-1",
      orderType: "dine_in",
      customerName: "Ben",
      customerContact: "09170000000",
      customerData: { table: "4" },
      items: [
        {
          menuItemId: "m-1",
          menuItemName: "Latte",
          quantity: 2,
          price: 120,
          subtotal: 240,
        },
      ],
      total: 240,
    });

    const result = decodeQrToOrder(handoff);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.customerName).toBe("Ben");
  });
});
