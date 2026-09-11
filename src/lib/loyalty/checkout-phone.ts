/**
 * The phone number a checkout form currently holds, as a loyalty identity.
 *
 * Pure. Merchants name their own form fields, so the DECLARED field type is the
 * authority and the well-known keys are only a fallback — the same reasoning as
 * `normalizeCustomerData`. Returns null until the number is complete enough to
 * be the same identity the order will eventually be stored under, so a
 * half-typed number never looks up a stranger's card.
 */

import { normalizePhoneE164 } from '@/lib/phone'
import type { NormalizableField } from '@/lib/customer-field-normalization'

/** Keys a tenant's own field naming might not cover. Mirrors `resolveCustomerIdentity`. */
const FALLBACK_KEYS = ['customer_phone', 'phone', 'mobile', 'contact_number'] as const

export interface CheckoutLoyaltyPhoneInput {
  formFields: NormalizableField[]
  customerData: Record<string, string>
}

export function resolveCheckoutLoyaltyPhone({
  formFields,
  customerData,
}: CheckoutLoyaltyPhoneInput): string | null {
  for (const field of formFields) {
    if (field.field_type !== 'phone') continue
    const e164 = normalizePhoneE164(customerData[field.field_name])
    if (e164) return e164
  }

  for (const key of FALLBACK_KEYS) {
    const e164 = normalizePhoneE164(customerData[key])
    if (e164) return e164
  }

  return null
}
