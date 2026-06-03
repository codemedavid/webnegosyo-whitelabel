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

  const { ck, ...rest } = parsed;
  const expected = computeChecksum(rest);
  if (ck !== expected) {
    return { ok: false, error: "checksum" };
  }

  return { ok: true, payload: parsed };
}
