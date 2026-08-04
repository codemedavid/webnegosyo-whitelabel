// QR-handoff order codec.
//
// Encodes a QrOrderPayloadV1 into a compact, URL-safe string for embedding in a
// QR code, and decodes it back with integrity checks. The checksum is an
// FNV-1a 32-bit hash rendered as 8-char lowercase hex — a corruption guard
// ONLY, not a security measure.
//
// This file is mirrored byte-for-byte inside
// webnegosyo-app/lib/qr-order-codec.ts. The two implementations MUST stay
// identical so a payload encoded on the web decodes on React Native and vice
// versa. Keep the logic pure synchronous JS (no platform APIs) and do NOT sort
// object keys — the checksum depends on the exact insertion order below.

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';
import type { QrOrderPayloadV1, QrPickupPayloadV1 } from '@/types/qr-order';

export type { QrPickupPayloadV1 };

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
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Build the canonical no-ck object with keys in the exact insertion order
 * from the QrOrderPayloadV1 type, then hash its JSON. Order is load-bearing:
 * both web and RN MUST produce the same string here.
 */
export function computeChecksum(payload: Omit<QrOrderPayloadV1, 'ck'>): string {
  const ordered: Omit<QrOrderPayloadV1, 'ck'> = {
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
export function encodeOrderToQr(payload: Omit<QrOrderPayloadV1, 'ck'>): string {
  const ck = computeChecksum(payload);
  const full: QrOrderPayloadV1 = { ...payload, ck };
  return compressToEncodedURIComponent(JSON.stringify(full));
}

export type DecodeResult =
  | { ok: true; payload: QrOrderPayloadV1 }
  | { ok: false; error: 'empty' | 'corrupt' | 'version' | 'checksum' };

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
    return { ok: false, error: 'empty' };
  }

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(s);
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  if (json === null || json === '') {
    return { ok: false, error: 'corrupt' };
  }

  let parsed: QrOrderPayloadV1;
  try {
    parsed = JSON.parse(json) as QrOrderPayloadV1;
  } catch {
    return { ok: false, error: 'corrupt' };
  }

  if (parsed.v !== QR_SCHEMA_VERSION) {
    return { ok: false, error: 'version' };
  }

  // A pickup ticket rides the same envelope and would otherwise fall through
  // to the checksum branch, which happens to reject it but only by accident.
  // Reject it on the discriminator so the two kinds never depend on a hash
  // collision to stay apart.
  if ((parsed as { k?: string }).k !== undefined) {
    return { ok: false, error: 'corrupt' };
  }

  const { ck, ...rest } = parsed;
  const expected = computeChecksum(rest);
  if (ck !== expected) {
    return { ok: false, error: 'checksum' };
  }

  return { ok: true, payload: parsed };
}

// --- Pickup ticket ---------------------------------------------------------
//
// A second payload kind sharing the envelope above. It carries no cart: just
// a pointer to an order that already exists, plus the order's HMAC tracking
// token so the merchant app can have the web API verify it server-side.

/**
 * Canonical no-ck object for a pickup ticket, in fixed insertion order.
 * Same rule as computeChecksum: order is load-bearing across web and RN.
 */
export function computePickupChecksum(
  payload: Omit<QrPickupPayloadV1, 'ck'>
): string {
  const ordered: Omit<QrPickupPayloadV1, 'ck'> = {
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
  payload: Omit<QrPickupPayloadV1, 'ck'>
): string {
  const ck = computePickupChecksum(payload);
  const full: QrPickupPayloadV1 = { ...payload, ck };
  return compressToEncodedURIComponent(JSON.stringify(full));
}

export type PickupDecodeResult =
  | { ok: true; payload: QrPickupPayloadV1 }
  | {
      ok: false;
      error: 'empty' | 'corrupt' | 'version' | 'checksum' | 'not_pickup';
    };

/**
 * Decode a pickup ticket, validating integrity.
 *
 * Mirrors decodeQrToOrder's error vocabulary and adds 'not_pickup' for a
 * well-formed payload of the other kind — the merchant app scans both with
 * one camera, so "this is the wrong kind of code" must be distinguishable
 * from "this code is damaged".
 */
export function decodePickupQr(s: string): PickupDecodeResult {
  if (!s) {
    return { ok: false, error: 'empty' };
  }

  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(s);
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  if (json === null || json === '') {
    return { ok: false, error: 'corrupt' };
  }

  let parsed: QrPickupPayloadV1;
  try {
    parsed = JSON.parse(json) as QrPickupPayloadV1;
  } catch {
    return { ok: false, error: 'corrupt' };
  }

  if (parsed.v !== QR_SCHEMA_VERSION) {
    return { ok: false, error: 'version' };
  }

  if (parsed.k !== 'pickup') {
    return { ok: false, error: 'not_pickup' };
  }

  const { ck, ...rest } = parsed;
  const expected = computePickupChecksum(rest);
  if (ck !== expected) {
    return { ok: false, error: 'checksum' };
  }

  return { ok: true, payload: parsed };
}
