/** @jest-environment node */
import {
  LALAMOVE_MARKETS,
  isStorePinRequired,
  validateStorePin,
  STORE_PIN_MESSAGES,
} from '@/lib/delivery/store-pin-rules'

const QC = { lat: 14.6225, lng: 121.0672 }

describe('validateStorePin', () => {
  it('accepts a Philippine pin, and no pin when none is required', () => {
    expect(validateStorePin({ ...QC, market: 'PH', isPinRequired: true })).toBeNull()
    expect(validateStorePin({ lat: null, lng: null, market: 'PH', isPinRequired: false })).toBeNull()
    expect(validateStorePin({ lat: undefined, lng: undefined, isPinRequired: false })).toBeNull()
  })

  it('refuses half a pin', () => {
    expect(validateStorePin({ lat: 14.6, lng: null, market: 'PH', isPinRequired: false })).toBe(STORE_PIN_MESSAGES.incomplete)
  })

  it('refuses a missing pin when delivery needs one', () => {
    expect(validateStorePin({ lat: null, lng: null, market: 'PH', isPinRequired: true })).toBe(STORE_PIN_MESSAGES.required)
  })

  it('refuses a pin outside the Philippines for a PH store (unset market counts as PH)', () => {
    expect(validateStorePin({ lat: 22.3193, lng: 114.1694, market: 'PH', isPinRequired: false })).toBe(STORE_PIN_MESSAGES.outsidePhilippines)
    expect(validateStorePin({ lat: 0, lng: 0, market: null, isPinRequired: false })).toBe(STORE_PIN_MESSAGES.outsidePhilippines)
    expect(validateStorePin({ lat: 22.3193, lng: 114.1694, market: 'hk', lalamoveEnabled: true, isPinRequired: true })).toBeNull()
  })

  it('reads a stale market on a store without Lalamove as the Philippines', () => {
    expect(validateStorePin({ ...QC, market: 'HK', lalamoveEnabled: false, isPinRequired: true })).toBeNull()
    expect(validateStorePin({ lat: 22.3193, lng: 114.1694, market: 'HK', lalamoveEnabled: false, isPinRequired: false }))
      .toBe(STORE_PIN_MESSAGES.outsidePhilippines)
    expect(validateStorePin({ lat: 22.3193, lng: 114.1694, market: ' ', lalamoveEnabled: true, isPinRequired: false }))
      .toBe(STORE_PIN_MESSAGES.outsidePhilippines)
  })

  it('uses branch wording when asked', () => {
    expect(validateStorePin({ lat: null, lng: null, isPinRequired: true, subject: 'branch' })).toBe(STORE_PIN_MESSAGES.branchRequired)
  })
})

describe('isStorePinRequired', () => {
  it('is required when Lalamove or distance pricing is on', () => {
    expect(isStorePinRequired({ lalamove_enabled: true })).toBe(true)
    expect(isStorePinRequired({ distance_delivery_enabled: true })).toBe(true)
    expect(isStorePinRequired({ lalamove_enabled: false, distance_delivery_enabled: null })).toBe(false)
  })
})

describe('LALAMOVE_MARKETS', () => {
  it('lists the Philippines first', () => {
    expect(LALAMOVE_MARKETS.map((market) => market.code)).toEqual(['PH', 'SG', 'HK', 'TH', 'TW', 'MY', 'VN'])
  })
})
