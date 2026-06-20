import {
  resolveDeliveryQuotePlan,
  DELIVERY_MISCONFIGURED_MESSAGE,
  type DeliveryQuoteInput,
} from '@/lib/delivery-quote'

// A fully-valid delivery order with Lalamove enabled and all coordinates present.
const base: DeliveryQuoteInput = {
  isDeliveryOrder: true,
  lalamoveEnabled: true,
  distanceEnabled: false,
  restaurantLatitude: 14.6,
  restaurantLongitude: 121.0,
  deliveryLatitude: 14.7,
  deliveryLongitude: 121.1,
}

describe('resolveDeliveryQuotePlan', () => {
  test('returns idle when it is not a delivery order', () => {
    const plan = resolveDeliveryQuotePlan({ ...base, isDeliveryOrder: false })
    expect(plan.kind).toBe('idle')
  })

  test('returns idle when neither lalamove nor distance delivery is enabled', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      lalamoveEnabled: false,
      distanceEnabled: false,
    })
    expect(plan.kind).toBe('idle')
  })

  test('flags misconfigured (with message) when enabled but restaurant coordinates are missing', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      restaurantLatitude: null,
      restaurantLongitude: null,
    })
    expect(plan.kind).toBe('misconfigured')
    if (plan.kind === 'misconfigured') {
      expect(plan.message).toBe(DELIVERY_MISCONFIGURED_MESSAGE)
    }
  })

  test('misconfigured takes precedence over a missing delivery address', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      restaurantLatitude: null,
      restaurantLongitude: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
    })
    expect(plan.kind).toBe('misconfigured')
  })

  test('returns awaiting-address when configured but the customer has not picked a delivery point', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      deliveryLatitude: null,
      deliveryLongitude: null,
    })
    expect(plan.kind).toBe('awaiting-address')
  })

  test('returns a lalamove plan when lalamove is enabled and all coordinates are present', () => {
    const plan = resolveDeliveryQuotePlan(base)
    expect(plan.kind).toBe('lalamove')
  })

  test('lalamove wins over distance when both flags are on', () => {
    const plan = resolveDeliveryQuotePlan({ ...base, distanceEnabled: true })
    expect(plan.kind).toBe('lalamove')
  })

  test('returns a distance plan when only distance delivery is enabled', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      lalamoveEnabled: false,
      distanceEnabled: true,
    })
    expect(plan.kind).toBe('distance')
  })

  test('treats zero coordinates as valid (0,0 is a real point, not "missing")', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      restaurantLatitude: 0,
      restaurantLongitude: 0,
    })
    expect(plan.kind).toBe('lalamove')
  })

  test('treats string coordinates (as stored on tenants/customerData) as present', () => {
    const plan = resolveDeliveryQuotePlan({
      ...base,
      restaurantLatitude: '14.60',
      restaurantLongitude: '121.00',
      deliveryLatitude: '14.70',
      deliveryLongitude: '121.10',
    })
    expect(plan.kind).toBe('lalamove')
  })
})
