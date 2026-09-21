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
import { phoneFieldKeys } from '@/lib/contact-field-keys'
import type { NormalizableField } from '@/lib/customer-field-normalization'

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

  // Nothing is declared a phone (a merchant may have typed their phone field
  // as text or number), so fall back to the field NAME — the same rule
  // `resolveCustomerIdentity` uses to read the stored order.
  for (const key of phoneFieldKeys(Object.keys(customerData))) {
    const e164 = normalizePhoneE164(customerData[key])
    if (e164) return e164
  }

  return null
}
