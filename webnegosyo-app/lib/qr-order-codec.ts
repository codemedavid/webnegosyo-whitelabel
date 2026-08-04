// QR-handoff order codec (React Native mirror).
//
// This file is a byte-for-byte logical MIRROR of the web codec at
// src/lib/qr-order-codec.ts. The two implementations MUST stay identical so a
// payload encoded on the web decodes here on React Native and vice versa.
//
// The QrOrderItemV1 / QrOrderPayloadV1 types are mirrored inline (the web
// version imports them from @/types/qr-order; React Native cannot share that
// path, so they live here). Keep them in sync with src/types/qr-order.ts.
//
// The checksum is an FNV-1a 32-bit hash rendered as 8-char lowercase hex — a
// corruption guard ONLY, not a security measure. Keep the logic pure
// synchronous JS (no platform APIs) and do NOT sort object keys — the checksum
// depends on the exact insertion order below.

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

export interface QrOrderItemV1 {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  price: number;
  subtotal: number;
  variationSelections?: {
    typeName: string;
    optionName: string;
    priceAdjustment: number;
  }[];
  variation?: string;
  addons?: { name: string; price: number; quantity?: number }[];
  specialInstructions?: string;
  isUpsellItem?: boolean;
  isBundleItem?: boolean;
  bundleId?: string;
  bundleName?: string;
  slotName?: string;
}

export interface QrOrderPayloadV1 {
  v: 1;
  cid: string; // clientOrderId = crypto.randomUUID()
  t: number; // creation time in Unix epoch milliseconds
  tenantId: string;
  tenantSlug: string;
  orderTypeId: string;
  orderType: string; // label, e.g. "dine_in"
  customerName: string;
  customerContact: string;
  customerData: Record<string, unknown>; // dynamic form-field values
  items: QrOrderItemV1[];
  total: number; // client-computed grand total (vendor re-validates)
  paymentMethodId?: string;
  paymentMethod?: string;
  ck: string; // checksum (see below)
}

/**
 * Pickup-ticket payload. A SECOND QR kind that shares the cart-handoff
 * envelope but carries no cart: it is a pointer to an order that already
 * exists, shown by the customer at the counter so staff can confirm they are
 * handing the bag to the right person.
 *
 * `token` is the order's HMAC tracking token. This app cannot verify it
 * locally (the secret lives on the web server), so it forwards the whole
 * triple to /api/orders/track, which verifies timing-safely and returns the
 * order. The checksum below remains a corruption guard only.
 *
 * Mirrors src/types/qr-order.ts.
 */
export interface QrPickupPayloadV1 {
  v: 1;
  k: "pickup"; // discriminator: absent on cart-handoff payloads
  tenantId: string;
  orderId: string;
  token: string; // HMAC tracking token, verified server-side
  t: number; // creation time in Unix epoch milliseconds
  ck: string; // checksum (see codec)
}

export const QR_SCHEMA_VERSION = 1;

// Encoded-character warning threshold. QR codes degrade in scannability past
// roughly this length, so callers should warn (not block) when exceeded.
export const QR_SIZE_WARN_THRESHOLD = 1200;

/**
 * FNV-1a 32-bit hash of a string, rendered as 8-char lowercase hex.
 * Pure synchronous JS so it is identical on web and React Native.
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime 16777619, computed via shifts to stay within 32-bit unsigned.
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit and pad to 8 hex chars.
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Build the canonical no-ck object with keys in the exact insertion order
 * from the QrOrderPayloadV1 type, then hash its JSON. Order is load-bearing:
 * both web and RN MUST produce the same string here.
 */
export function computeChecksum(payload: Omit<QrOrderPayloadV1, "ck">): string {
  const ordered: Omit<QrOrderPayloadV1, "ck"> = {
    v: payload.v,
    cid: payload.cid,
    t: payload.t,
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    orderTypeId: payload.orderTypeId,
    orderType: payload.orderType,
    customerName: payload.customerName,
    customerContact: payload.customerContact,
    customerData: payload.customerData,
    items: payload.items,
    total: payload.total,
    paymentMethodId: payload.paymentMethodId,
    paymentMethod: payload.paymentMethod,
  };
  return fnv1aHex(JSON.stringify(ordered));
}

/**
 * Encode a payload (without ck) to a compressed, URL-safe QR string.
 * Computes and attaches the checksum, then compresses the full JSON.
 */
export function encodeOrderToQr(payload: Omit<QrOrderPayloadV1, "ck">): string {
  const ck = computeChecksum(payload);
  const full: QrOrderPayloadV1 = { ...payload, ck };
  return compressToEncodedURIComponent(JSON.stringify(full));
}

export type DecodeResult =
  | { ok: true; payload: QrOrderPayloadV1 }
  | { ok: false; error: "empty" | "corrupt" | "version" | "checksum" };

/**
 * Decode a QR string back into a payload, validating integrity.
 *  - empty string            -> 'empty'
 *  - decompress null/throw   -> 'corrupt'
 *  - JSON.parse throw        -> 'corrupt'
 *  - payload.v !== 1         -> 'version'
 *  - checksum mismatch       -> 'checksum'
 *  - otherwise               -> ok
 */
export function decodeQrToOrder(s: string): DecodeResult {
  if (!s) {
    return { ok: false, error: "empty" };
  }

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(s);
  } catch {
    return { ok: false, error: "corrupt" };
  }
  if (json === null || json === "") {
    return { ok: false, error: "corrupt" };
  }

  let parsed: QrOrderPayloadV1;
  try {
    parsed = JSON.parse(json) as QrOrderPayloadV1;
  } catch {
    return { ok: false, error: "corrupt" };
  }

  if (parsed.v !== QR_SCHEMA_VERSION) {
    return { ok: false, error: "version" };
  }

  // A pickup ticket rides the same envelope and would otherwise fall through
  // to the checksum branch, which happens to reject it but only by accident.
  // Reject it on the discriminator so the two kinds never depend on a hash
  // collision to stay apart.
  if ((parsed as { k?: string }).k !== undefined) {
    return { ok: false, error: "corrupt" };
  }

  const { ck, ...rest } = parsed;
  const expected = computeChecksum(rest);
  if (ck !== expected) {
    return { ok: false, error: "checksum" };
  }

  return { ok: true, payload: parsed };
}

// --- Pickup ticket ---------------------------------------------------------
//
// A second payload kind sharing the envelope above. It carries no cart: just
// a pointer to an order that already exists, plus the order's HMAC tracking
// token so this app can have the web API verify it server-side.

/**
 * Canonical no-ck object for a pickup ticket, in fixed insertion order.
 * Same rule as computeChecksum: order is load-bearing across web and RN.
 */
export function computePickupChecksum(
  payload: Omit<QrPickupPayloadV1, "ck">
): string {
  const ordered: Omit<QrPickupPayloadV1, "ck"> = {
    v: payload.v,
    k: payload.k,
    tenantId: payload.tenantId,
    orderId: payload.orderId,
    token: payload.token,
    t: payload.t,
  };
  return fnv1aHex(JSON.stringify(ordered));
}

/** Encode a pickup ticket (without ck) to a compressed, URL-safe QR string. */
export function encodePickupQr(
  payload: Omit<QrPickupPayloadV1, "ck">
): string {
  const ck = computePickupChecksum(payload);
  const full: QrPickupPayloadV1 = { ...payload, ck };
  return compressToEncodedURIComponent(JSON.stringify(full));
}

export type PickupDecodeResult =
  | { ok: true; payload: QrPickupPayloadV1 }
  | {
      ok: false;
      error: "empty" | "corrupt" | "version" | "checksum" | "not_pickup";
    };

/**
 * Decode a pickup ticket, validating integrity.
 *
 * Mirrors decodeQrToOrder's error vocabulary and adds 'not_pickup' for a
 * well-formed payload of the other kind — this app scans both with one
 * camera, so "this is the wrong kind of code" must be distinguishable from
 * "this code is damaged".
 */
export function decodePickupQr(s: string): PickupDecodeResult {
  if (!s) {
    return { ok: false, error: "empty" };
  }

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(s);
  } catch {
    return { ok: false, error: "corrupt" };
  }
  if (json === null || json === "") {
    return { ok: false, error: "corrupt" };
  }

  let parsed: QrPickupPayloadV1;
  try {
    parsed = JSON.parse(json) as QrPickupPayloadV1;
  } catch {
    return { ok: false, error: "corrupt" };
  }

  if (parsed.v !== QR_SCHEMA_VERSION) {
    return { ok: false, error: "version" };
  }

  if (parsed.k !== "pickup") {
    return { ok: false, error: "not_pickup" };
  }

  const { ck, ...rest } = parsed;
  const expected = computePickupChecksum(rest);
  if (ck !== expected) {
    return { ok: false, error: "checksum" };
  }

  return { ok: true, payload: parsed };
}
