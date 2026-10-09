import {
  haversineDistanceKm,
  resolveDistanceDeliveryConfig,
  calculateDistanceDeliveryFee,
  quoteDistanceDelivery,
  toLatLng,
  distanceConfigFromTenant,
  feeStartsRisingAtKm,
  isFlatFee,
  feePreview,
  type DistanceDeliveryConfig,
  type MeasureDistanceKm,
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
  const config: DistanceDeliveryConfig = { perKm: 7, minFee: 55, radiusKm: 10 }
  // Ate Lolet's store and a real order: 4.0 km in a straight line, 8.16 km by road.
  const store = { lat: 15.44454447, lng: 120.77120664 }
  const destination = { lat: 15.4804001, lng: 120.77600268 }
  const byRoad = (km: number) => jest.fn<ReturnType<MeasureDistanceKm>, Parameters<MeasureDistanceKm>>(async () => km)

  test('prices the measured road distance, not the straight line', async () => {
    const measureKm = byRoad(8.16)

    const outcome = await quoteDistanceDelivery({ config, store, destination, measureKm })

    expect(measureKm).toHaveBeenCalledWith(store, destination)
    expect(outcome).toEqual({ kind: 'quote', quote: { distanceKm: 8.16, withinRadius: true, fee: 57.12 } })
  })

  test('refuses a road trip longer than the radius even when the straight line fits', async () => {
    const outcome = await quoteDistanceDelivery({ config, store, destination, measureKm: byRoad(19.2) })

    expect(outcome.kind === 'quote' && outcome.quote.withinRadius).toBe(false)
  })

  test('never prices below the straight-line distance (a road cannot be shorter)', async () => {
    const outcome = await quoteDistanceDelivery({ config: { ...config, minFee: 0 }, store, destination, measureKm: byRoad(1) })

    expect(outcome.kind === 'quote' && outcome.quote.distanceKm).toBeCloseTo(4.02, 2)
  })

  test('skips the road lookup when even the straight line is beyond the radius', async () => {
    const measureKm = byRoad(1)

    const outcome = await quoteDistanceDelivery({ config: { ...config, radiusKm: 2 }, store, destination, measureKm })

    expect(measureKm).not.toHaveBeenCalled()
    expect(outcome.kind === 'quote' && outcome.quote.withinRadius).toBe(false)
  })

  test('reports a store without a location', async () => {
    const outcome = await quoteDistanceDelivery({ config, store: null, destination, measureKm: byRoad(1) })

    expect(outcome).toEqual({ kind: 'store-unlocated' })
  })

  test('reports a destination without a location', async () => {
    const outcome = await quoteDistanceDelivery({ config, store, destination: null, measureKm: byRoad(1) })

    expect(outcome).toEqual({ kind: 'destination-unlocated' })
  })
})

describe('toLatLng', () => {
  test('accepts numbers and numeric strings', () => {
    expect(toLatLng(15.44, 120.77)).toEqual({ lat: 15.44, lng: 120.77 })
    expect(toLatLng('15.4804001', ' 120.776 ')).toEqual({ lat: 15.4804001, lng: 120.776 })
  })

  test('accepts 0 as a real coordinate', () => {
    expect(toLatLng(0, 0)).toEqual({ lat: 0, lng: 0 })
  })

  test.each([
    [null, 120],
    [undefined, 120],
    ['', 120],
    ['   ', 120],
    ['abc', 120],
    [Number.NaN, 120],
    [91, 120],
    [15, 181],
    [true, 120],
  ])('rejects a missing or impossible coordinate (%p, %p)', (lat, lng) => {
    // Number(null) is 0: a missing store location used to become a point off
    // the coast of Africa, and every address then read "outside the delivery area".
    expect(toLatLng(lat, lng)).toBeNull()
  })
})

describe('distanceConfigFromTenant', () => {
  const tenant = {
    lalamove_enabled: false,
    distance_delivery_enabled: true,
    delivery_price_per_km: 7,
    delivery_min_fee: 55,
    delivery_radius_km: 10,
  }

  test('reads the pricing columns', () => {
    expect(distanceConfigFromTenant(tenant)).toEqual({ perKm: 7, minFee: 55, radiusKm: 10 })
  })

  test('accepts numeric strings as Postgres numerics can arrive', () => {
    expect(
      distanceConfigFromTenant({ ...tenant, delivery_price_per_km: '7.00', delivery_min_fee: '55.00', delivery_radius_km: '10.00' })
    ).toEqual({ perKm: 7, minFee: 55, radiusKm: 10 })
  })

  test('is off while Lalamove is on (Lalamove always wins)', () => {
    expect(distanceConfigFromTenant({ ...tenant, lalamove_enabled: true })).toBeNull()
  })

  test('is off when the store has not enabled it', () => {
    expect(distanceConfigFromTenant({ ...tenant, distance_delivery_enabled: false })).toBeNull()
  })
})

describe('fee preview', () => {
  test('the fee starts rising where distance × rate passes the minimum', () => {
    expect(feeStartsRisingAtKm({ perKm: 7, minFee: 55, radiusKm: 10 })).toBeCloseTo(7.857, 3)
  })

  test('a free per-km rate never rises', () => {
    expect(feeStartsRisingAtKm({ perKm: 0, minFee: 55, radiusKm: 10 })).toBe(Number.POSITIVE_INFINITY)
  })

  test('flags a setup that can only ever charge the minimum', () => {
    // Kkape at Tsaa: 3 km × ₱15 = ₱45 never passes ₱50.
    expect(isFlatFee({ perKm: 15, minFee: 50, radiusKm: 3 })).toBe(true)
    expect(isFlatFee({ perKm: 7, minFee: 55, radiusKm: 10 })).toBe(false)
  })

  test('previews the fee at quarter points of the radius', () => {
    expect(feePreview({ perKm: 7, minFee: 55, radiusKm: 10 })).toEqual([
      { distanceKm: 2.5, fee: 55 },
      { distanceKm: 5, fee: 55 },
      { distanceKm: 7.5, fee: 55 },
      { distanceKm: 10, fee: 70 },
    ])
  })

  test('drops duplicate preview points on a tiny radius', () => {
    expect(feePreview({ perKm: 10, minFee: 0, radiusKm: 0.2 }).map((p) => p.distanceKm)).toEqual([0.1, 0.2])
  })
})
