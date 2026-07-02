import { buildLalamoveDeliveryArgs } from '@/lib/lalamove-order-details'

describe('buildLalamoveDeliveryArgs', () => {
  test('promotes delivery_address to top-level deliveryAddress', () => {
    const result = buildLalamoveDeliveryArgs({
      delivery_address: '123 Rizal St, Makati',
    })
    expect(result.deliveryAddress).toBe('123 Rizal St, Makati')
  })

  test('parses string coordinates into numeric deliveryLatitude/deliveryLongitude', () => {
    const result = buildLalamoveDeliveryArgs({
      delivery_address: '123 Rizal St',
      delivery_lat: '14.5995',
      delivery_lng: '120.9842',
    })
    expect(result.deliveryLatitude).toBeCloseTo(14.5995, 4)
    expect(result.deliveryLongitude).toBeCloseTo(120.9842, 4)
  })

  test('accepts numeric coordinates as-is', () => {
    const result = buildLalamoveDeliveryArgs({
      delivery_address: '123 Rizal St',
      delivery_lat: 14.5995,
      delivery_lng: 120.9842,
    })
    expect(result.deliveryLatitude).toBeCloseTo(14.5995, 4)
    expect(result.deliveryLongitude).toBeCloseTo(120.9842, 4)
  })

  test('omits deliveryAddress when delivery_address is missing', () => {
    const result = buildLalamoveDeliveryArgs({ customer_name: 'Ana' })
    expect(result).not.toHaveProperty('deliveryAddress')
  })

  test('omits deliveryAddress when delivery_address is an empty string', () => {
    const result = buildLalamoveDeliveryArgs({ delivery_address: '   ' })
    expect(result).not.toHaveProperty('deliveryAddress')
  })

  test('omits coordinates when they are absent', () => {
    const result = buildLalamoveDeliveryArgs({ delivery_address: '123 Rizal St' })
    expect(result).not.toHaveProperty('deliveryLatitude')
    expect(result).not.toHaveProperty('deliveryLongitude')
  })

  test('omits coordinates that do not parse to a finite number', () => {
    const result = buildLalamoveDeliveryArgs({
      delivery_address: '123 Rizal St',
      delivery_lat: 'not-a-number',
      delivery_lng: '',
    })
    expect(result).not.toHaveProperty('deliveryLatitude')
    expect(result).not.toHaveProperty('deliveryLongitude')
  })

  test('returns an empty object when customerData is undefined', () => {
    expect(buildLalamoveDeliveryArgs(undefined)).toEqual({})
  })

  test('returns an empty object when customerData is empty', () => {
    expect(buildLalamoveDeliveryArgs({})).toEqual({})
  })
})
