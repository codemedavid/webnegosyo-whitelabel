/**
 * Tells the two QR kinds apart from a single scan.
 *
 * The scan screen has one camera and accepts both a customer's cart handoff
 * and a pickup ticket. Staff pointed the phone at exactly one code, so when
 * neither decoder accepts it the answer must be about that code — "damaged",
 * "empty" — never about which decoder was tried first.
 */

import {
  decodePickupQr,
  decodeQrToOrder,
  type DecodeResult,
  type QrOrderPayloadV1,
  type QrPickupPayloadV1,
} from "../qr-order-codec";

type DecodeError = Extract<DecodeResult, { ok: false }>["error"];

export type ScannedQr =
  | { kind: "pickup"; payload: QrPickupPayloadV1 }
  | { kind: "handoff"; payload: QrOrderPayloadV1 }
  | { kind: "unreadable"; error: DecodeError };

export function classifyScannedQr(raw: string): ScannedQr {
  const pickup = decodePickupQr(raw);
  if (pickup.ok) {
    return { kind: "pickup", payload: pickup.payload };
  }

  // 'not_pickup' is the ONLY outcome that means "try the other decoder". Any
  // other failure describes the code itself, and retrying it as a handoff
  // would replace a true diagnosis with a misleading one.
  if (pickup.error !== "not_pickup") {
    return { kind: "unreadable", error: pickup.error };
  }

  const handoff = decodeQrToOrder(raw);
  if (handoff.ok) {
    return { kind: "handoff", payload: handoff.payload };
  }

  return { kind: "unreadable", error: handoff.error };
}
