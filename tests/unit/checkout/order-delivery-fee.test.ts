import { describe, it, expect } from '@jest/globals'
import { isValidClientDeliveryFee, resolveOrderDeliveryFee } from '@/lib/checkout/order-delivery-fee'

/**
 * Which delivery fee an order is billed.
 *
 * Only two sources exist (src/lib/delivery-quote.ts): a Lalamove quotation,
 * or the tenant's distance formula. The distance fee is recomputed here; the
 * Lalamove fee cannot be without re-quoting, so it is range-checked only. An
 * order with no fee source carries no fee, whatever the browser sent.
 */

const distance = { perKm: 10, minFee: 50, radiusKm: 5 }
const store = { lat: 14.5995, lng: 120.9842 }
const near = { lat: 14.6, lng: 120.99 }

describe('isValidClientDeliveryFee', () => {
  it.each([undefined, null, 0, 49.5])('accepts %s', (fee) => {
    expect(isValidClientDeliveryFee(fee)).toBe(true)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '50', 10_000_000])('refuses %s', (fee) => {
    expect(isValidClientDeliveryFee(fee)).toBe(false)
  })
})

describe('resolveOrderDeliveryFee', () => {
  const byRoad = (km: number) => jest.fn(async () => km)
  const base = {
    clientFee: 1,
    isDeliveryOrder: true,
    lalamoveEnabled: false,
    distanceConfig: distance,
    store,
    destination: near,
    measureKm: byRoad(1.2),
  }

  it('bills no fee on a non-delivery order, whatever was sent', async () => {
    await expect(
      resolveOrderDeliveryFee({ ...base, clientFee: 120, isDeliveryOrder: false, lalamoveEnabled: true, distanceConfig: null })
    ).resolves.toEqual({ kind: 'fee', fee: undefined })
  })

  it('bills no fee when the tenant has no fee source', async () => {
    await expect(resolveOrderDeliveryFee({ ...base, clientFee: 120, distanceConfig: null })).resolves.toEqual({
      kind: 'fee',
      fee: undefined,
    })
  })

  it('keeps a Lalamove quotation fee, including ₱0, without measuring anything', async () => {
    const measureKm = byRoad(1)

    await expect(
      resolveOrderDeliveryFee({ ...base, clientFee: 0, lalamoveEnabled: true, distanceConfig: null, measureKm })
    ).resolves.toEqual({ kind: 'fee', fee: 0 })
    await expect(
      resolveOrderDeliveryFee({ ...base, clientFee: 185, lalamoveEnabled: true, distanceConfig: null, measureKm })
    ).resolves.toEqual({ kind: 'fee', fee: 185 })
    expect(measureKm).not.toHaveBeenCalled()
  })

  it('recomputes the fee from the road distance and ignores the sent one', async () => {
    // 6 km by road × ₱10 = ₱60, above the ₱50 minimum.
    await expect(resolveOrderDeliveryFee({ ...base, distanceConfig: { ...distance, radiusKm: 10 }, measureKm: byRoad(6) })).resolves.toEqual({
      kind: 'fee',
      fee: 60,
    })
  })

  it('refuses an address whose road trip is longer than the radius', async () => {
    await expect(resolveOrderDeliveryFee({ ...base, measureKm: byRoad(5.5) })).resolves.toMatchObject({ kind: 'refuse' })
  })

  it('refuses an address outside the radius in a straight line', async () => {
    const far = { lat: 15.5, lng: 121.5 }

    await expect(resolveOrderDeliveryFee({ ...base, destination: far })).resolves.toMatchObject({ kind: 'refuse' })
  })

  it('refuses a delivery with no picked coordinates', async () => {
    await expect(resolveOrderDeliveryFee({ ...base, destination: null })).resolves.toMatchObject({
      kind: 'refuse',
      error: expect.stringContaining('select your delivery address'),
    })
  })

  it('treats a store without coordinates as a store-side failure, not a refusal', async () => {
    await expect(resolveOrderDeliveryFee({ ...base, store: null })).resolves.toMatchObject({ kind: 'abort' })
  })
})
