/**
 * Lalamove sender (pickup contact) resolution.
 *
 * The driver calls the SENDER to coordinate pickup, so it must always be the
 * store's number and never the customer's. This resolution was copy-pasted
 * into three places (server actions, /api/lalamove, the Convex template);
 * one shared function owns it on the web side now.
 */

import { describe, test, expect } from '@jest/globals'
import { resolveLalamoveSender } from '@/lib/lalamove-sender'

const STORE = {
  name: 'Retiro Kitchen',
  footer_business_name: 'Retiro Kitchen Corp',
  lalamove_sender_phone: '09170000000',
  footer_phone: '09171111111',
  footer_whatsapp: '09172222222',
  lalamove_market: 'PH',
}

describe('resolveLalamoveSender', () => {
  test('prefers the explicit pickup phone, normalized for the market', () => {
    const sender = resolveLalamoveSender(STORE)
    expect(sender.phone).toBe('+639170000000')
  })

  test('falls back to the footer phone, then WhatsApp', () => {
    expect(resolveLalamoveSender({ ...STORE, lalamove_sender_phone: null }).phone).toBe(
      '+639171111111',
    )
    expect(
      resolveLalamoveSender({ ...STORE, lalamove_sender_phone: null, footer_phone: null }).phone,
    ).toBe('+639172222222')
  })

  test('returns no phone when the store has none — booking must refuse, not guess', () => {
    const sender = resolveLalamoveSender({
      ...STORE,
      lalamove_sender_phone: null,
      footer_phone: null,
      footer_whatsapp: null,
    })
    expect(sender.phone).toBeUndefined()
  })

  test('names the pickup after the store, with sensible fallbacks', () => {
    expect(resolveLalamoveSender(STORE).name).toBe('Retiro Kitchen')
    expect(resolveLalamoveSender({ ...STORE, name: null }).name).toBe('Retiro Kitchen Corp')
    expect(
      resolveLalamoveSender({ ...STORE, name: null, footer_business_name: null }).name,
    ).toBe('Restaurant')
  })
})
