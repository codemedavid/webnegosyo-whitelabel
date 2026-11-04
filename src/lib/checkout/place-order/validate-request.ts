/**
 * Boundary checks: everything that can be judged from the request alone,
 * before the tenant is read. This backs a public server action.
 */

import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { sanitizeCustomerData } from '@/lib/checkout/customer-data-guard'
import { sanitizePaymentProof, type SanitizedPaymentProof } from '@/lib/checkout/payment-proof-guard'
import { isValidClientDeliveryFee } from '@/lib/checkout/order-delivery-fee'
import { refused, type PlaceOrderFailure, type PlaceOrderInput, type PlaceOrderLineInput } from './types'

export const INVALID_DELIVERY_FEE_MESSAGE =
  'We couldn’t confirm the delivery fee. Please re-enter your delivery address and try again.'

export interface ValidRequest {
  ok: true
  lines: PlaceOrderLineInput[]
  /** Client customer data with every server-owned key stripped. */
  clientCustomerData: Record<string, unknown> | undefined
  paymentProof: SanitizedPaymentProof | undefined
}

export async function validateRequest(
  input: PlaceOrderInput
): Promise<ValidRequest | { ok: false; failure: PlaceOrderFailure }> {
  const { tenantId, governmentClaim } = input

  // Basic input sanity checks before hitting the database
  if (!tenantId || typeof tenantId !== 'string') {
    return { ok: false, failure: refused('Invalid tenant ID') }
  }

  // A Senior/PWD claim is 20% + VAT off for anyone who types an ID, with no
  // session: orders carrying one are limited per client IP (fail open).
  const { govClaimLimitRefusal } = await import('@/lib/gov-discount-checkout/rate-limits')
  const claimRefusal = await govClaimLimitRefusal(tenantId, governmentClaim)
  if (claimRefusal) return { ok: false, failure: refused(claimRefusal) }

  // ── Boundary validation (this is a public server action) ──
  // Shape only: a price that passes is still just a claim, floored below.
  // Nothing the web checkout builds can fail these, so a refusal here never
  // hides behind the optimistic confirmation screen for a real customer.
  const parsedLines = parseOrderLines(input.items)
  if (!parsedLines.ok) {
    console.warn('[createOrderAction] Refused malformed order lines', {
      tenantId,
      issues: parsedLines.issues.slice(0, 10),
    })
    return { ok: false, failure: refused(parsedLines.error) }
  }
  const lines: PlaceOrderLineInput[] = parsedLines.lines

  // Server-owned keys (presell claim, discount, inventory snapshot, …) are
  // stripped here, so the only copies that can exist are the server's own.
  const sanitizedCustomerData = sanitizeCustomerData(input.customerData)
  if (!sanitizedCustomerData.ok) {
    return { ok: false, failure: refused(sanitizedCustomerData.error) }
  }

  if (!isValidClientDeliveryFee(input.deliveryFee)) {
    return { ok: false, failure: refused(INVALID_DELIVERY_FEE_MESSAGE) }
  }

  return {
    ok: true,
    lines,
    clientCustomerData: sanitizedCustomerData.data,
    paymentProof: sanitizePaymentProof(input.paymentProof),
  }
}
