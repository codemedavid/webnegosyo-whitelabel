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
  it('bills no fee on a non-delivery order, whatever was sent', () => {
    expect(
      resolveOrderDeliveryFee({ clientFee: 120, isDeliveryOrder: false, lalamoveEnabled: true, distanceConfig: null, store, destination: near })
    ).toEqual({ kind: 'fee', fee: undefined })
  })

  it('bills no fee when the tenant has no fee source', () => {
    expect(
      resolveOrderDeliveryFee({ clientFee: 120, isDeliveryOrder: true, lalamoveEnabled: false, distanceConfig: null, store, destination: near })
    ).toEqual({ kind: 'fee', fee: undefined })
  })

  it('keeps a Lalamove quotation fee, including ₱0', () => {
    expect(
      resolveOrderDeliveryFee({ clientFee: 0, isDeliveryOrder: true, lalamoveEnabled: true, distanceConfig: null, store, destination: near })
    ).toEqual({ kind: 'fee', fee: 0 })
    expect(
      resolveOrderDeliveryFee({ clientFee: 185, isDeliveryOrder: true, lalamoveEnabled: true, distanceConfig: null, store, destination: near })
    ).toEqual({ kind: 'fee', fee: 185 })
  })

  it('recomputes a distance fee and ignores the sent one', () => {
    const result = resolveOrderDeliveryFee({ clientFee: 1, isDeliveryOrder: true, lalamoveEnabled: false, distanceConfig: distance, store, destination: near })

    expect(result.kind).toBe('fee')
    if (result.kind === 'fee') expect(result.fee).toBeGreaterThanOrEqual(50)
  })

  it('refuses an address outside the radius', () => {
    const far = { lat: 15.5, lng: 121.5 }

    expect(
      resolveOrderDeliveryFee({ clientFee: 1, isDeliveryOrder: true, lalamoveEnabled: false, distanceConfig: distance, store, destination: far }).kind
    ).toBe('refuse')
  })

  it('refuses a delivery with no picked coordinates', () => {
    expect(
      resolveOrderDeliveryFee({
        clientFee: 1,
        isDeliveryOrder: true,
        lalamoveEnabled: false,
        distanceConfig: distance,
        store,
        destination: { lat: Number.NaN, lng: Number.NaN },
      }).kind
    ).toBe('refuse')
  })

  it('treats a store without coordinates as a store-side failure, not a refusal', () => {
    expect(
      resolveOrderDeliveryFee({
        clientFee: 1,
        isDeliveryOrder: true,
        lalamoveEnabled: false,
        distanceConfig: distance,
        store: { lat: Number.NaN, lng: Number.NaN },
        destination: near,
      }).kind
    ).toBe('abort')
  })
})
