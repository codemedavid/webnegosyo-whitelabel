/**
 * Payment proof helpers — ported from src/lib/payment-proof.ts so web and mobile
 * enforce identical rules. Pure logic for the "upload screenshot and/or reference
 * number" checkout requirement.
 *
 * A payment method may set `require_payment_proof`. When it does, checkout is
 * blocked until the customer provides AT LEAST ONE of: a screenshot URL or a
 * reference number.
 */

import type { PaymentMethod } from '../types/database'

/** Cloudinary folder where customer payment screenshots are stored. */
export const PAYMENT_PROOF_FOLDER = 'payment-proofs'

/** Accepted screenshot image formats. */
export const PAYMENT_PROOF_ALLOWED_FORMATS = ['png', 'jpg', 'jpeg', 'webp'] as const

/** Max screenshot size in bytes (5MB). */
export const PAYMENT_PROOF_MAX_FILE_SIZE = 5_000_000

export interface PaymentProofInput {
  screenshotUrl?: string | null
  reference?: string | null
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** Whether the selected payment method requires proof of payment. */
export function isPaymentProofRequired(
  method: PaymentMethod | null | undefined,
): boolean {
  return Boolean(method?.require_payment_proof)
}

/**
 * Whether the provided proof satisfies the selected method's requirement.
 * Always true when no method is selected or the method does not require proof.
 */
export function isPaymentProofSatisfied(
  method: PaymentMethod | null | undefined,
  input: PaymentProofInput,
): boolean {
  if (!isPaymentProofRequired(method)) return true
  return hasValue(input.screenshotUrl) || hasValue(input.reference)
}

/**
 * Returns a user-facing error message when proof is required but missing,
 * otherwise null.
 */
export function getPaymentProofError(
  method: PaymentMethod | null | undefined,
  input: PaymentProofInput,
): string | null {
  if (isPaymentProofSatisfied(method, input)) return null
  return 'Please upload a payment screenshot or enter your reference number to continue.'
}
