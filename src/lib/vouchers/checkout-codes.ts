/**
 * The state behind the checkout's voucher field.
 *
 * Pure, so the rule that matters can be tested without a browser: **any change
 * to what the discount was computed against invalidates the preview.**
 *
 * A customer applies a code at ₱1,000, then removes an item. The voucher's
 * ₱500 minimum no longer holds. The server re-prices from the codes and charges
 * correctly — so without this, the customer is shown one number and billed
 * another, which is the worst way to be right. Better a moment of "checking…"
 * than a confident wrong total.
 */

import { normalizeVoucherCode } from './admin-validation'
import type { VoucherPreview } from './preview'
import type { OrderDiscountLine } from '../order-totals'

export interface CheckoutVoucherState {
  /** Entry order preserved: it decides a solo-only conflict. */
  codes: readonly string[]
  /** Null whenever there is nothing trustworthy to show. */
  preview: VoucherPreview | null
  /** What the preview was computed against. */
  previewFingerprint: string | null
}

export interface FingerprintableLine {
  id: string
  subtotal: number
}

export const EMPTY_CHECKOUT_VOUCHER_STATE: CheckoutVoucherState = {
  codes: [],
  preview: null,
  previewFingerprint: null,
}

/** Adding a code changes what every other code is worth, so the preview goes. */
export function addCode(state: CheckoutVoucherState, raw: string): CheckoutVoucherState {
  const code = normalizeVoucherCode(raw)
  if (code === '' || state.codes.includes(code)) return state

  return { codes: [...state.codes, code], preview: null, previewFingerprint: null }
}

/**
 * Removing one changes the others too — stacking is sequential, so the second
 * voucher discounts what the first left behind.
 */
export function removeCode(state: CheckoutVoucherState, raw: string): CheckoutVoucherState {
  const code = normalizeVoucherCode(raw)
  const codes = state.codes.filter((existing) => existing !== code)
  if (codes.length === state.codes.length) return state

  return { codes, preview: null, previewFingerprint: null }
}

/**
 * Everything a discount is computed from: the lines, the delivery fee (which
 * free-delivery codes come off) and the service charge.
 */
export function cartFingerprint(
  lines: readonly FingerprintableLine[],
  deliveryFee: number | null | undefined,
  serviceCharge: number | null | undefined,
): string {
  const cart = lines.map((line) => `${line.id}:${line.subtotal}`).join('|')
  return `${cart}#${deliveryFee ?? 0}#${serviceCharge ?? 0}`
}

export function isPreviewStale(state: CheckoutVoucherState, fingerprint: string): boolean {
  if (!state.preview) return false
  return state.previewFingerprint !== fingerprint
}

/** Ready for `computeOrderTotals`. Rejected codes contribute nothing. */
export function discountLinesFrom(preview: VoucherPreview | null): OrderDiscountLine[] {
  if (!preview) return []

  return preview.accepted.map((entry) => ({
    label: entry.name,
    amount: entry.amount,
    code: entry.code,
  }))
}
