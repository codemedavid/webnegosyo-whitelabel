/**
 * One camera, two QR kinds.
 *
 * The scan screen accepts both a customer's cart handoff and a pickup ticket.
 * Whichever it is, staff pointed the phone at exactly one code, so a failure
 * must name the real problem — "this code is damaged" — and never the
 * bookkeeping of which decoder was tried first.
 */

import { classifyScannedQr } from "./dispatch";
import { encodePickupQr, encodeOrderToQr } from "../qr-order-codec";

const pickupQr = encodePickupQr({
  v: 1,
  k: "pickup",
  tenantId: "tenant-abc",
  orderId: "order-123",
  token: "a".repeat(64),
  t: 1_700_000_000_000,
});

const handoffQr = encodeOrderToQr({
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

describe("classifyScannedQr", () => {
  it("recognises a pickup ticket", () => {
    const result = classifyScannedQr(pickupQr);

    expect(result.kind).toBe("pickup");
    if (result.kind !== "pickup") return;
    expect(result.payload.orderId).toBe("order-123");
  });

  it("recognises a cart handoff", () => {
    const result = classifyScannedQr(handoffQr);

    expect(result.kind).toBe("handoff");
    if (result.kind !== "handoff") return;
    expect(result.payload.customerName).toBe("Ana");
  });

  it("reports a damaged code as unreadable, not as the wrong kind", () => {
    // Both decoders reject this. Surfacing 'not_pickup' here would tell staff
    // to go find a different code when the real fix is to refresh this one.
    const result = classifyScannedQr("!!!garbage!!!");

    expect(result.kind).toBe("unreadable");
    if (result.kind !== "unreadable") return;
    expect(result.error).toBe("corrupt");
  });

  it("reports an empty scan as empty", () => {
    const result = classifyScannedQr("");

    expect(result.kind).toBe("unreadable");
    if (result.kind !== "unreadable") return;
    expect(result.error).toBe("empty");
  });

  it("reports a tampered pickup ticket as damaged rather than falling through", () => {
    // A pickup ticket that fails its checksum must NOT be retried as a
    // handoff — that path would report a confusing error about a cart.
    const tampered = pickupQr.slice(0, -4) + "AAAA";

    const result = classifyScannedQr(tampered);

    expect(result.kind).toBe("unreadable");
    if (result.kind !== "unreadable") return;
    expect(["checksum", "corrupt"]).toContain(result.error);
  });
});
