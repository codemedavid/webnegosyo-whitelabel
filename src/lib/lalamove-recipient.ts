/**
 * Who the Lalamove rider calls at the drop-off.
 *
 * `customer_contact` is the canonical identity of an order, but it is allowed
 * to be empty: a tenant's checkout form may have no phone field, and an email
 * can stand in for one. A booking that forwards it verbatim then sends `''`
 * to Lalamove, which refuses the order — the merchant sees a delivery quote it
 * can never book. Resolution order:
 *
 *   1. the customer's phone, from `customer_contact` or whichever
 *      `customer_data` field the tenant's form used for it;
 *   2. the store's own pickup phone, so the booking still goes through and
 *      the rider has someone to call — the caller is told this happened so
 *      the merchant can be warned;
 *   3. nothing, which the caller must refuse.
 *
 * Mirrored in convex-template/convex/lalamoveContact.ts — keep both in step.
 */

import { isE164Phone, normalizeLalamovePhone } from '@/lib/lalamove-phone'

/**
 * Whether a checkout field, by its label, holds the customer's phone.
 * Merchants name the field themselves ("Phone", "Contact No.", "Mobile
 * Number"), so the match is on the normalized label rather than a fixed list —
 * seacook's live form uses "Phone", which an exact lowercase list missed.
 */
export function isPhoneFieldKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return (
    normalized.includes('phone') ||
    normalized.includes('mobile') ||
    normalized.startsWith('contact')
  )
}

export type LalamoveRecipientSource = 'customer' | 'store' | 'none'

export interface LalamoveRecipientSourceOrder {
  customer_contact?: string | null
  customer_data?: Record<string, unknown> | null
}

export interface LalamoveRecipient {
  phone: string | undefined
  source: LalamoveRecipientSource
}

function customerPhoneCandidates(order: LalamoveRecipientSourceOrder): string[] {
  const fromData = Object.entries(order.customer_data ?? {})
    .filter(([key]) => isPhoneFieldKey(key))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
  return [order.customer_contact ?? '', ...fromData]
}

export function resolveLalamoveRecipient(
  order: LalamoveRecipientSourceOrder,
  market: string | null | undefined,
  storePhone: string | undefined
): LalamoveRecipient {
  for (const candidate of customerPhoneCandidates(order)) {
    // An email or a placeholder ("walk-in") has no digits worth normalizing;
    // a string with an "@" is never a phone even if it contains digits.
    if (candidate.includes('@')) continue
    const phone = normalizeLalamovePhone(candidate, market)
    if (isE164Phone(phone)) return { phone, source: 'customer' }
  }

  if (isE164Phone(storePhone)) return { phone: storePhone, source: 'store' }

  return { phone: undefined, source: 'none' }
}

/** The line a merchant should read after a booking that used the store phone. */
export const STORE_PHONE_RECIPIENT_NOTICE =
  'The customer left no phone number, so the rider will call the store instead.'
