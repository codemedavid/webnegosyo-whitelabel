import type { CheckoutLead, PlatformPaymentMethod } from '@/types/database'

/**
 * What the PUBLIC confirmation page (`/checkout/confirmation?confirm=<ref>`)
 * may know about a lead. The reference number is the page's only credential,
 * so the buyer's name, email, phone, business, notes, status and ids never
 * leave the server — only what the page renders.
 */
export interface CheckoutLeadConfirmation {
  reference_number: string
  amount: number
  payment_term: CheckoutLead['payment_term']
  payment_proof_url: string | null
  platform_payment_methods: Pick<PlatformPaymentMethod, 'name' | 'details' | 'qr_code_url'> | null
}

export const CHECKOUT_LEAD_CONFIRMATION_SELECT =
  'reference_number, amount, payment_term, payment_proof_url, platform_payment_methods(name, details, qr_code_url)'

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toPaymentMethod(raw: unknown): CheckoutLeadConfirmation['platform_payment_methods'] {
  const method = Array.isArray(raw) ? raw[0] : raw
  if (typeof method !== 'object' || method === null) return null
  const record = method as Record<string, unknown>
  if (typeof record.name !== 'string') return null
  return {
    name: record.name,
    details: asNullableString(record.details),
    qr_code_url: asNullableString(record.qr_code_url),
  }
}

/** Copies only the confirmation fields, whatever else the row carries. */
export function toCheckoutLeadConfirmation(row: unknown): CheckoutLeadConfirmation | null {
  if (typeof row !== 'object' || row === null) return null
  const record = row as Record<string, unknown>
  if (typeof record.reference_number !== 'string') return null
  return {
    reference_number: record.reference_number,
    amount: Number(record.amount ?? 0),
    payment_term: record.payment_term as CheckoutLeadConfirmation['payment_term'],
    payment_proof_url: asNullableString(record.payment_proof_url),
    platform_payment_methods: toPaymentMethod(record.platform_payment_methods),
  }
}
