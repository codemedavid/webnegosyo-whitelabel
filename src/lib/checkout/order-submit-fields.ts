/**
 * The small pieces of an order submission that both checkout paths — the
 * order save and the QR hand-off — assemble from checkout state.
 *
 * Lifted out of `useCheckout`, where each was an inline ternary, several of
 * them written twice. Pure.
 */
import { resolveOrderContact } from '@/lib/customer-identity'

export interface QuoteForOrderInput {
  deliveryFee: number | null
  quotationId: string | null
  quoteSignature: string | null
  /** The RAW address the fee was quoted for. */
  quotedAddress: string
  /** The RAW address currently typed. */
  currentAddress: string | undefined
}

export interface QuoteForOrder {
  deliveryFee: number | undefined
  quotationId: string | undefined
  quoteSignature: string | undefined
}

/**
 * The delivery fee, quotation and signature to send with the order.
 *
 * Compared against the RAW address the fee was quoted for, so a whitespace-only
 * normalization difference never drops a valid fee. A ₱0 quote is a fee —
 * `!== null`, never truthiness — the same as the summary the customer saw.
 */
export function resolveQuoteForOrder(input: QuoteForOrderInput): QuoteForOrder {
  const { deliveryFee, quotationId, quoteSignature, quotedAddress, currentAddress } = input
  const isForCurrentAddress = quotedAddress === currentAddress
  const validDeliveryFeeForOrder = (deliveryFee !== null && isForCurrentAddress) ? deliveryFee : undefined
  const validQuotationId = (quotationId && isForCurrentAddress) ? quotationId : undefined
  const validQuoteSignature = (quoteSignature && validQuotationId) ? quoteSignature : undefined
  return { deliveryFee: validDeliveryFeeForOrder, quotationId: validQuotationId, quoteSignature: validQuoteSignature }
}

export interface PaymentProofState {
  url: string
  publicId: string
  reference: string
}

export interface PaymentProofPayload {
  url: string | null
  publicId: string | null
  reference: string | null
}

function hasPaymentProof(proof: PaymentProofState): boolean {
  return Boolean(proof.url || proof.reference)
}

/** The proof argument of `createOrderAction`, or undefined when none was given. */
export function buildPaymentProofPayload(proof: PaymentProofState): PaymentProofPayload | undefined {
  if (!hasPaymentProof(proof)) return undefined
  return { url: proof.url || null, publicId: proof.publicId || null, reference: proof.reference || null }
}

export interface PaymentProofCustomerFields {
  payment_proof_url?: string
  payment_proof_public_id?: string
  payment_proof_reference?: string
}

/** The proof as customer-data keys, the way the QR payload carries it. */
export function paymentProofCustomerFields(proof: PaymentProofState): PaymentProofCustomerFields {
  if (!hasPaymentProof(proof)) return {}
  return {
    payment_proof_url: proof.url || undefined,
    payment_proof_public_id: proof.publicId || undefined,
    payment_proof_reference: proof.reference || undefined,
  }
}

export interface ScheduleCustomerFields {
  scheduled_for?: string
  scheduled_for_label?: string
}

/** The chosen slot as customer-data keys; empty for an ASAP order. */
export function scheduleCustomerFields(
  scheduledForISO: string | null,
  scheduledForLabel: string | null
): ScheduleCustomerFields {
  if (!scheduledForISO) return {}
  return { scheduled_for: scheduledForISO, scheduled_for_label: scheduledForLabel ?? '' }
}

export interface OrderCustomerInfo {
  name: string | undefined
  contact: string | undefined
}

/**
 * Who placed the order. The contact is resolved from any phone/email field the
 * tenant form uses, so it is a stable per-customer identity for analytics.
 */
export function buildOrderCustomerInfo(customerData: Readonly<Record<string, string>>): OrderCustomerInfo {
  return {
    name: customerData.customer_name || undefined,
    contact: resolveOrderContact({ name: customerData.customer_name, customerData }) || undefined,
  }
}

interface RandomUuidSource {
  randomUUID?: () => string
}

/** A fresh id for one checkout attempt; the server dedupes retries on it. */
export function mintClientOrderId(source: RandomUuidSource | undefined): string {
  if (source && typeof source.randomUUID === 'function') return source.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
