/** @jest-environment node */
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const createClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
const measureRoadDistanceKm = jest.fn<Promise<number>, unknown[]>(async () => 4)
jest.mock('@/lib/maps/road-distance-server', () => ({ measureRoadDistanceKm: (...args: unknown[]) => measureRoadDistanceKm(...args) }))

const tenant = {
  id: 't1', multi_branch_enabled: true, lalamove_enabled: false, distance_delivery_enabled: true,
  delivery_price_per_km: 10, delivery_min_fee: 50, delivery_radius_km: 8,
  restaurant_address: 'Main St', restaurant_latitude: 14.6, restaurant_longitude: 121.0,
}
const outlets = [{ id: 'b1', tenant_id: 't1', is_active: true, address: 'Branch', latitude: 14.7, longitude: 121.1, delivery_radius_km: 3 }]

describe('calculateDistanceDeliveryFeeAction', () => {
  beforeEach(() => {
    measureRoadDistanceKm.mockClear()
    createClient.mockResolvedValue(fakeSupabaseTables({ tenants: [tenant], outlets }).client)
  })

  it('measures from the chosen branch and uses its radius', async () => {
    const { calculateDistanceDeliveryFeeAction } = await import('@/app/actions/delivery')
    const result = await calculateDistanceDeliveryFeeAction('t1', 14.71, 121.11, 'b1')
    expect(measureRoadDistanceKm.mock.calls[0]).toEqual([{ lat: 14.7, lng: 121.1 }, { lat: 14.71, lng: 121.11 }])
    expect(result).toEqual({ success: true, data: { fee: 50, distanceKm: 4, withinRadius: false, radiusKm: 3 } })
  })

  it('measures from the store without a branch', async () => {
    const { calculateDistanceDeliveryFeeAction } = await import('@/app/actions/delivery')
    const result = await calculateDistanceDeliveryFeeAction('t1', 14.62, 121.02)
    expect(measureRoadDistanceKm.mock.calls[0][0]).toEqual({ lat: 14.6, lng: 121.0 })
    expect(result).toMatchObject({ success: true, data: { radiusKm: 8, withinRadius: true } })
  })

  it('refuses invalid coordinates and an unpriced store', async () => {
    const { calculateDistanceDeliveryFeeAction } = await import('@/app/actions/delivery')
    await expect(calculateDistanceDeliveryFeeAction('t1', Number.NaN, 121)).resolves.toMatchObject({ success: false })
    createClient.mockResolvedValue(fakeSupabaseTables({ tenants: [{ ...tenant, lalamove_enabled: true }], outlets }).client)
    await expect(calculateDistanceDeliveryFeeAction('t1', 14.6, 121)).resolves.toMatchObject({ success: false })
  })
})
