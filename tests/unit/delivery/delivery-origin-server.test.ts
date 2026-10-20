/** @jest-environment node */
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'
import { loadDeliveryOrigin } from '@/lib/delivery/delivery-origin-server'

const store = {
  id: 't1', multi_branch_enabled: true,
  restaurant_address: 'Main St', restaurant_latitude: '14.6', restaurant_longitude: '121.0', delivery_radius_km: 8,
}
const outlets = [
  { id: 'b1', tenant_id: 't1', is_active: true, address: 'Branch St', latitude: 14.7, longitude: 121.1, delivery_radius_km: 4 },
  { id: 'b2', tenant_id: 't1', is_active: false, address: 'Closed St', latitude: 14.8, longitude: 121.2, delivery_radius_km: null },
  { id: 'x1', tenant_id: 'other', is_active: true, address: 'Elsewhere', latitude: 10.3, longitude: 123.9, delivery_radius_km: null },
]

describe('loadDeliveryOrigin', () => {
  it('starts at the branch the order names when the store runs branches', async () => {
    const { client } = fakeSupabaseTables({ outlets })
    await expect(loadDeliveryOrigin(client, store, 'b1')).resolves.toEqual({
      ok: true,
      origin: { source: 'outlet', outletId: 'b1', address: 'Branch St', point: { lat: 14.7, lng: 121.1 }, radiusKm: 4 },
    })
  })

  it('uses the store for no branch, an inactive branch, another store\'s branch, or branches switched off', async () => {
    const { client, seen } = fakeSupabaseTables({ outlets })
    const storeOrigin = { source: 'store', outletId: null, address: 'Main St', point: { lat: 14.6, lng: 121.0 }, radiusKm: 8 }
    for (const outletId of [null, undefined, '', 'b2', 'x1']) {
      await expect(loadDeliveryOrigin(client, store, outletId)).resolves.toEqual({ ok: true, origin: storeOrigin })
    }
    const before = seen.length
    await expect(loadDeliveryOrigin(client, { ...store, multi_branch_enabled: false }, 'b1')).resolves.toEqual({ ok: true, origin: storeOrigin })
    expect(seen.length).toBe(before)
  })

  it('reports no origin when nothing is pinned', async () => {
    const { client } = fakeSupabaseTables({ outlets: [] })
    await expect(loadDeliveryOrigin(client, { ...store, restaurant_latitude: null }, null)).resolves.toEqual({ ok: true, origin: null })
  })

  it('fails rather than guessing when the branch cannot be read', async () => {
    const { client } = fakeSupabaseTables({ outlets }, { outlets: 'timeout' })
    await expect(loadDeliveryOrigin(client, store, 'b1')).resolves.toEqual({ ok: false })
  })
})
