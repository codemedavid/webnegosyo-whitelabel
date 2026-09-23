/**
 * The browser's `customerData` blob, made safe to store.
 *
 * The server writes into the same envelope — presell claims, the voucher
 * breakdown, the inventory snapshot, payment proof (Convex), Messenger send
 * state — and later READS those keys back to decide things. A key the server
 * reads must never be accepted from the browser. The worst case was presell:
 * a forged `presell_claim_id` + `presell_lines` on an ordinary order survived
 * (the server only overwrote them for carts WITH presell lines), and
 * cancelling that order called `apply_presell_order('void')` for claims that
 * never existed, decrementing `sold_qty` and inflating a date's allocation.
 *
 * Also bounds the blob: long strings are truncated (a long note should not cost
 * a sale), but a blob that is still enormous is refused — no checkout form
 * produces one.
 */

import {
  PRESELL_CLAIM_ID_KEY,
  PRESELL_DATE_KEY,
  PRESELL_LINES_KEY,
} from '@/lib/presell/checkout-schedule'

/**
 * Every key the SERVER writes into customer_data. Each is re-stamped by the
 * server when it applies; none may arrive from the browser.
 */
export const SERVER_OWNED_CUSTOMER_DATA_KEYS = [
  PRESELL_DATE_KEY,
  PRESELL_CLAIM_ID_KEY,
  PRESELL_LINES_KEY,
  // writeOrderDiscount — the voucher breakdown receipts and reports read.
  'discount',
  // withInventorySelectionSnapshot — what stock depletion replays.
  '_inventory_selections',
  // createOrderAction (Convex) — proof columns ride in customer_data there.
  'payment_proof_url',
  'payment_proof_public_id',
  'payment_proof_reference',
  // Messenger send routes — a forged stamp suppresses the order message.
  'messenger_message_sent_at',
  // POS tender snapshot written by the register.
  'pos',
] as const

export const MAX_CUSTOMER_DATA_KEYS = 100
export const MAX_CUSTOMER_DATA_STRING_LENGTH = 2000
export const MAX_CUSTOMER_DATA_JSON_LENGTH = 16_000

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const DROPPED_KEYS = new Set<string>([...SERVER_OWNED_CUSTOMER_DATA_KEYS, ...FORBIDDEN_KEYS])

const TOO_LARGE_MESSAGE =
  'Your order details are too long to send. Please shorten your notes and try again.'
const UNREADABLE_MESSAGE = 'We couldn’t read your order details. Please refresh and try again.'

export type SanitizeCustomerDataResult =
  | { ok: true; data: Record<string, unknown> | undefined }
  | { ok: false; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncateStrings(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, MAX_CUSTOMER_DATA_STRING_LENGTH)
  if (Array.isArray(value)) return value.map(truncateStrings)
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_KEYS.has(key))
        .map(([key, nested]) => [key, truncateStrings(nested)])
    )
  }
  return value
}

function jsonLength(value: unknown): number | null {
  try {
    return JSON.stringify(value).length
  } catch {
    return null
  }
}

/** Strip server-owned keys, bound the size. Never mutates the input. */
export function sanitizeCustomerData(raw: unknown): SanitizeCustomerDataResult {
  if (raw === undefined || raw === null) return { ok: true, data: undefined }
  if (!isPlainObject(raw)) return { ok: false, error: UNREADABLE_MESSAGE }

  const entries = Object.entries(raw).filter(([key]) => !DROPPED_KEYS.has(key))
  if (entries.length > MAX_CUSTOMER_DATA_KEYS) return { ok: false, error: TOO_LARGE_MESSAGE }

  const data = Object.fromEntries(entries.map(([key, value]) => [key, truncateStrings(value)]))

  const length = jsonLength(data)
  if (length === null) return { ok: false, error: UNREADABLE_MESSAGE }
  if (length > MAX_CUSTOMER_DATA_JSON_LENGTH) return { ok: false, error: TOO_LARGE_MESSAGE }

  return { ok: true, data }
}
