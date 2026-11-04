/** @jest-environment node */
import { resolveDeliveryOrigin } from '@/lib/delivery/delivery-origin'

const store = { restaurant_address: 'Main St, Lipa', restaurant_latitude: '13.94', restaurant_longitude: '121.16', delivery_radius_km: 8 }
const branch = { id: 'b1', name: 'Tanauan', address: 'Gonzales St, Tanauan', latitude: 14.09, longitude: 121.14, delivery_radius_km: 5 }

describe('resolveDeliveryOrigin', () => {
  it('uses the branch pin and address when the branch has a pin', () => {
    expect(resolveDeliveryOrigin(store, branch)).toEqual({
      source: 'outlet', outletId: 'b1', address: 'Gonzales St, Tanauan', point: { lat: 14.09, lng: 121.14 }, radiusKm: 5,
    })
  })

  it('falls back to the store when there is no branch, or the branch has no pin', () => {
    const expected = { source: 'store', outletId: null, address: 'Main St, Lipa', point: { lat: 13.94, lng: 121.16 }, radiusKm: 8 }
    expect(resolveDeliveryOrigin(store, null)).toEqual(expected)
    expect(resolveDeliveryOrigin(store, { ...branch, latitude: null, longitude: null })).toEqual(expected)
  })

  it('uses the store address for a pinned branch with no address of its own', () => {
    expect(resolveDeliveryOrigin(store, { ...branch, address: '  ' })?.address).toBe('Main St, Lipa')
  })

  it('keeps the store radius when the branch sets none', () => {
    expect(resolveDeliveryOrigin(store, { ...branch, delivery_radius_km: null })?.radiusKm).toBe(8)
  })

  it('returns null when neither has a usable pin (0,0 is not a pin)', () => {
    expect(resolveDeliveryOrigin({ ...store, restaurant_latitude: null, restaurant_longitude: null }, null)).toBeNull()
    expect(resolveDeliveryOrigin({ ...store, restaurant_latitude: '0', restaurant_longitude: '0' }, null)).toBeNull()
  })
})
