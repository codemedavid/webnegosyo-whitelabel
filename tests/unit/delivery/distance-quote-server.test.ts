/** @jest-environment node */
jest.mock('@/lib/maps/road-distance-server', () => ({ measureRoadDistanceKm: jest.fn() }))
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { quoteDistanceFromOrigin, withOriginRadius } from '@/lib/delivery/distance-quote-server'

const store = {
  id: 't1', multi_branch_enabled: true, lalamove_enabled: false, distance_delivery_enabled: true,
  delivery_price_per_km: 10, delivery_min_fee: 50, delivery_radius_km: 8,
  restaurant_address: 'Main St', restaurant_latitude: 14.6, restaurant_longitude: 121.0,
}
const outlets = [{ id: 'b1', tenant_id: 't1', is_active: true, address: 'Branch', latitude: 14.7, longitude: 121.1, delivery_radius_km: 3 }]
const measured: Array<[unknown, unknown]> = []
const measureKm = async (from: unknown, to: unknown) => { measured.push([from, to]); return 2 }

beforeEach(() => { measured.length = 0 })

describe('withOriginRadius', () => {
  it('uses the branch radius when the origin carries one', () => {
    const config = { perKm: 10, minFee: 50, radiusKm: 8 }
    expect(withOriginRadius(config, { radiusKm: 3 })).toEqual({ ...config, radiusKm: 3 })
    expect(withOriginRadius(config, { radiusKm: null })).toBe(config)
    expect(withOriginRadius(config, null)).toBe(config)
  })
})

describe('quoteDistanceFromOrigin', () => {
  it('prices from the branch pin with the branch radius', async () => {
    const { client } = fakeSupabaseTables({ outlets })
    const result = await quoteDistanceFromOrigin(client, store, 'b1', { lat: 14.71, lng: 121.11 }, measureKm)
    expect(measured[0][0]).toEqual({ lat: 14.7, lng: 121.1 })
    expect(result).toEqual({ kind: 'quote', fee: 50, distanceKm: 2, withinRadius: true, radiusKm: 3 })
  })

  it('prices from the store pin without a branch', async () => {
    const { client } = fakeSupabaseTables({ outlets })
    const result = await quoteDistanceFromOrigin(client, store, null, { lat: 14.61, lng: 121.01 }, measureKm)
    expect(measured[0][0]).toEqual({ lat: 14.6, lng: 121.0 })
    expect(result).toMatchObject({ kind: 'quote', radiusKm: 8 })
  })

  it('says why it could not price', async () => {
    const { client } = fakeSupabaseTables({ outlets })
    await expect(quoteDistanceFromOrigin(client, { ...store, lalamove_enabled: true }, null, { lat: 14.6, lng: 121 }, measureKm))
      .resolves.toEqual({ kind: 'unpriced' })
    await expect(quoteDistanceFromOrigin(client, { ...store, restaurant_latitude: null }, null, { lat: 14.6, lng: 121 }, measureKm))
      .resolves.toEqual({ kind: 'no-origin' })
    const failing = fakeSupabaseTables({ outlets }, { outlets: 'down' })
    await expect(quoteDistanceFromOrigin(failing.client, store, 'b1', { lat: 14.6, lng: 121 }, measureKm))
      .resolves.toEqual({ kind: 'branch-unreadable' })
  })
})
