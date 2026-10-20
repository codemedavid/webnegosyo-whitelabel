/** @jest-environment node */
import { assessDeliveryPin, isInsidePhilippines, DEFAULT_FAR_PIN_KM } from '@/lib/delivery/pin-assessment'

const store = { lat: 14.6255, lng: 121.0672 } // Project 4, Quezon City

describe('isInsidePhilippines', () => {
  it('accepts Luzon, Visayas, Mindanao and Palawan and refuses Hong Kong and 0,0', () => {
    expect(isInsidePhilippines({ lat: 14.6, lng: 121.0 })).toBe(true)
    expect(isInsidePhilippines({ lat: 10.31, lng: 123.89 })).toBe(true)
    expect(isInsidePhilippines({ lat: 7.07, lng: 125.61 })).toBe(true)
    expect(isInsidePhilippines({ lat: 9.74, lng: 118.73 })).toBe(true)
    expect(isInsidePhilippines({ lat: 22.3, lng: 114.17 })).toBe(false)
    expect(isInsidePhilippines({ lat: 0, lng: 0 })).toBe(false)
  })
})

describe('assessDeliveryPin', () => {
  it('says nothing about a pin a few km from the store', () => {
    expect(assessDeliveryPin({ pin: { lat: 14.65, lng: 121.05 }, origin: store, market: 'PH' })).toEqual({ isBlocked: false, warning: null })
  })

  it('blocks a pin outside the Philippines for a PH store', () => {
    expect(assessDeliveryPin({ pin: { lat: 22.3, lng: 114.17 }, origin: store, market: 'PH' }).isBlocked).toBe(true)
    expect(assessDeliveryPin({ pin: { lat: 22.3, lng: 114.17 }, origin: null, market: 'HK' }).isBlocked).toBe(false)
  })

  it('warns when the pin sits on the store itself', () => {
    const result = assessDeliveryPin({ pin: { lat: 14.62551, lng: 121.06722 }, origin: store, market: 'PH' })
    expect(result.warning).toEqual({ kind: 'at-store', distanceKm: expect.any(Number) })
  })

  it('warns past the store radius, or past the default when there is none', () => {
    const davao = { lat: 7.07, lng: 125.61 }
    const far = assessDeliveryPin({ pin: davao, origin: store, market: 'PH' })
    expect(far.warning?.kind).toBe('far')
    expect(far.warning?.distanceKm).toBeGreaterThan(900)
    const fifteenKm = { lat: 14.76, lng: 121.07 }
    expect(assessDeliveryPin({ pin: fifteenKm, origin: store, market: 'PH' }).warning).toBeNull()
    expect(assessDeliveryPin({ pin: fifteenKm, origin: store, market: 'PH', radiusKm: 10 }).warning?.kind).toBe('far')
    expect(DEFAULT_FAR_PIN_KM).toBe(30)
  })

  it('does nothing without a pin, and skips distance checks without a store pin', () => {
    expect(assessDeliveryPin({ pin: null, origin: store, market: 'PH' })).toEqual({ isBlocked: false, warning: null })
    expect(assessDeliveryPin({ pin: { lat: 7.07, lng: 125.61 }, origin: null, market: 'PH' })).toEqual({ isBlocked: false, warning: null })
  })
})
