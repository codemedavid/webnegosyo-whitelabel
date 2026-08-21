/**
 * Lalamove sender (pickup contact) resolution.
 *
 * The driver calls the SENDER to coordinate pickup, so this must always be
 * the store's contact and never the customer's — the historical "driver calls
 * the customer for pickup" bug. The same resolution used to be copy-pasted
 * into the server actions, /api/lalamove, and the Convex template; the web
 * side shares this one function now (Convex cannot import from src/ and keeps
 * its own mirror in convex-template/convex/lalamove.ts).
 */

import { normalizeLalamovePhone } from '@/lib/lalamove-phone'

export interface LalamoveSenderSource {
  name?: string | null
  footer_business_name?: string | null
  lalamove_sender_phone?: string | null
  footer_phone?: string | null
  footer_whatsapp?: string | null
  lalamove_market?: string | null
}

export interface LalamoveSender {
  name: string
  phone: string | undefined
}

export function resolveLalamoveSender(source: LalamoveSenderSource): LalamoveSender {
  const rawPhone =
    source.lalamove_sender_phone || source.footer_phone || source.footer_whatsapp || undefined
  return {
    name: source.name || source.footer_business_name || 'Restaurant',
    phone: normalizeLalamovePhone(rawPhone, source.lalamove_market),
  }
}
