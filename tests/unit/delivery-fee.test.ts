import {
  haversineDistanceKm,
  resolveDistanceDeliveryConfig,
  calculateDistanceDeliveryFee,
  quoteDistanceDelivery,
  type DistanceDeliveryConfig,
} from '@/lib/delivery-fee'

describe('haversineDistanceKm', () => {
  test('returns 0 for identical points', () => {
    expect(haversineDistanceKm(14.5995, 120.9842, 14.5995, 120.9842)).toBe(0)
  })

  test('one degree of latitude is ~111.19 km', () => {
    expect(haversineDistanceKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })

  test('one degree of longitude at the equator is ~111.19 km', () => {
    expect(haversineDistanceKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1)
  })

  test('one degree of longitude shrinks with latitude (cos factor)', () => {
    // At 60° latitude a degree of longitude is ~half the equatorial width.
    expect(haversineDistanceKm(60, 0, 60, 1)).toBeCloseTo(111.19 * Math.cos((60 * Math.PI) / 180), 0)
  })

  test('is symmetric', () => {
    const a = haversineDistanceKm(14.5995, 120.9842, 14.676, 121.0437)
    const b = haversineDistanceKm(14.676, 121.0437, 14.5995, 120.9842)
    expect(a).toBeCloseTo(b, 6)
  })

  test('handles negative (southern/western) coordinates', () => {
    expect(haversineDistanceKm(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0)
    expect(haversineDistanceKm(-1, 0, 1, 0)).toBeCloseTo(222.39, 0)
  })
})

describe('resolveDistanceDeliveryConfig', () => {
  const valid = { enabled: true, perKm: 15, minFee: 49, radiusKm: 15 }

  test('returns a config when all fields are valid', () => {
    expect(resolveDistanceDeliveryConfig(valid)).toEqual({ perKm: 15, minFee: 49, radiusKm: 15 })
  })

  test('returns null when disabled', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, enabled: false })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, enabled: null })).toBeNull()
  })

  test('returns null when radius is missing or non-positive', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, radiusKm: null })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, radiusKm: 0 })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, radiusKm: -5 })).toBeNull()
  })

  test('returns null when per-km is missing or negative', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, perKm: null })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, perKm: -1 })).toBeNull()
  })

  test('returns null when minimum fee is missing or negative', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, minFee: null })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, minFee: -1 })).toBeNull()
  })

  test('allows a flat fee (perKm 0) with a positive minimum', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, perKm: 0 })).toEqual({ perKm: 0, minFee: 49, radiusKm: 15 })
  })

  test('rejects NaN / non-finite values', () => {
    expect(resolveDistanceDeliveryConfig({ ...valid, perKm: NaN })).toBeNull()
    expect(resolveDistanceDeliveryConfig({ ...valid, radiusKm: Infinity })).toBeNull()
  })
})

describe('calculateDistanceDeliveryFee', () => {
  const config: DistanceDeliveryConfig = { perKm: 15, minFee: 49, radiusKm: 15 }

  test('applies the minimum-fee floor for nearby distances', () => {
    // 1.2 km × ₱15 = ₱18 → floored to the ₱49 minimum
    const quote = calculateDistanceDeliveryFee(1.2, config)
    expect(quote).toEqual({ distanceKm: 1.2, withinRadius: true, fee: 49 })
  })

  test('charges distance × per-km once it exceeds the floor', () => {
    // 6 km × ₱15 = ₱90
    expect(calculateDistanceDeliveryFee(6, config).fee).toBe(90)
  })

  test('rounds the fee to two decimal places', () => {
    // 3.7 km × ₱15 = ₱55.50
    expect(calculateDistanceDeliveryFee(3.7, config).fee).toBe(55.5)
  })

  test('zero distance returns the minimum fee and is in range', () => {
    expect(calculateDistanceDeliveryFee(0, config)).toEqual({ distanceKm: 0, withinRadius: true, fee: 49 })
  })

  test('exactly at the radius boundary is still within range', () => {
    expect(calculateDistanceDeliveryFee(15, config).withinRadius).toBe(true)
  })

  test('just beyond the radius is out of range', () => {
    const quote = calculateDistanceDeliveryFee(15.01, config)
    expect(quote.withinRadius).toBe(false)
  })

  test('still computes a fee value when out of range (caller decides to block)', () => {
    const quote = calculateDistanceDeliveryFee(20, config)
    expect(quote.fee).toBe(300)
    expect(quote.withinRadius).toBe(false)
  })
})

describe('quoteDistanceDelivery', () => {
  const config: DistanceDeliveryConfig = { perKm: 15, minFee: 49, radiusKm: 50 }
  const store = { lat: 14.5995, lng: 120.9842 }

  test('combines distance and fee for two coordinates', () => {
    const destination = { lat: 14.676, lng: 121.0437 }
    const quote = quoteDistanceDelivery(store, destination, config)
    expect(quote.distanceKm).toBeGreaterThan(0)
    expect(quote.withinRadius).toBe(true)
    expect(quote.fee).toBeGreaterThanOrEqual(config.minFee)
  })

  test('flags destinations beyond the radius as out of range', () => {
    const farConfig: DistanceDeliveryConfig = { ...config, radiusKm: 1 }
    const destination = { lat: 14.676, lng: 121.0437 }
    expect(quoteDistanceDelivery(store, destination, farConfig).withinRadius).toBe(false)
  })

  test('identical store/destination is zero distance at the minimum fee', () => {
    const quote = quoteDistanceDelivery(store, store, config)
    expect(quote.distanceKm).toBe(0)
    expect(quote.fee).toBe(config.minFee)
    expect(quote.withinRadius).toBe(true)
  })
})
