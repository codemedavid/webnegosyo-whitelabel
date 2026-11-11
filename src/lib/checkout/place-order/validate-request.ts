/**
 * Boundary checks: everything that can be judged from the request alone,
 * before the tenant is read. This backs a public server action.
 */

import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { sanitizeCustomerData } from '@/lib/checkout/customer-data-guard'
import { sanitizePaymentProof, type SanitizedPaymentProof } from '@/lib/checkout/payment-proof-guard'
import { isValidClientDeliveryFee } from '@/lib/checkout/order-delivery-fee'
import { checkOrderRateLimit } from '@/lib/action-rate-limit'
import { verifyMessengerCustomerData } from '@/lib/messenger/recipient'
import { refused, type PlaceOrderFailure, type PlaceOrderInput, type PlaceOrderLineInput } from './types'

export const INVALID_DELIVERY_FEE_MESSAGE =
  'We couldn’t confirm the delivery fee. Please re-enter your delivery address and try again.'
export const ORDER_RATE_LIMIT_MESSAGE =
  'You’re placing orders very quickly. Please wait a minute, then try again.'

export interface ValidRequest {
  ok: true
  lines: PlaceOrderLineInput[]
  /** Client customer data with every server-owned key stripped. */
  clientCustomerData: Record<string, unknown> | undefined
  /** The Messenger chat whose link placed this order (its cart is emptied once saved). */
  chatSessionId: string | null
  paymentProof: SanitizedPaymentProof | undefined
}

export async function validateRequest(
  input: PlaceOrderInput
): Promise<ValidRequest | { ok: false; failure: PlaceOrderFailure }> {
  const { tenantId } = input

  // Basic input sanity checks before hitting the database
  if (!tenantId || typeof tenantId !== 'string') {
    return { ok: false, failure: refused('Invalid tenant ID') }
  }

  // ── Rate limit: orders per store per client address (fails open) ──
  // Never per store alone — a busy store must not be throttled as a whole —
  // and generous, since a dine-in floor can share one Wi-Fi address.
  const rate = await checkOrderRateLimit(tenantId)
  if (!rate.allowed) return { ok: false, failure: refused(ORDER_RATE_LIMIT_MESSAGE) }

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

  // The browser sends back what the Messenger menu link carried (a signed
  // token, or a raw PSID from before 2026-11-10); only a reference that
  // resolves to THIS store's customer survives, as the real PSID — the
  // order's Messenger messages go to it.
  const messenger = await verifyMessengerCustomerData(tenantId, sanitizedCustomerData.data)

  if (!isValidClientDeliveryFee(input.deliveryFee)) {
    return { ok: false, failure: refused(INVALID_DELIVERY_FEE_MESSAGE) }
  }

  return {
    ok: true,
    lines,
    clientCustomerData: messenger.customerData,
    chatSessionId: messenger.chatSessionId,
    paymentProof: sanitizePaymentProof(input.paymentProof),
  }
}
