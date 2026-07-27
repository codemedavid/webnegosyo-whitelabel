import { describe, it, expect } from '@jest/globals'
import { rankOutlets, type OutletLocation } from '@/lib/outlets/nearest-outlet'

/**
 * Nearest-branch detection is a convenience layered on top of a manual list —
 * never a gate. Geolocation can be denied, time out, or return nothing, and a
 * merchant can leave coordinates blank; in every one of those cases the
 * customer must still get an ordered, choosable list.
 *
 * Coordinates below are real Metro Manila points so distances are plausible:
 *   Makati ≈ (14.5547, 121.0244)  — origin used by most tests
 *   BGC    ≈ (14.5507, 121.0470)  — ~2.4 km from Makati
 *   QC     ≈ (14.6760, 121.0437)  — ~13.5 km from Makati
 *   Cavite ≈ (14.2790, 120.8600)  — ~35 km from Makati
 */

const MAKATI = { latitude: 14.5547, longitude: 121.0244 }

function makeOutlet(overrides: Partial<OutletLocation> & { id: string }): OutletLocation {
  return {
    slug: overrides.id,
    name: overrides.id,
    latitude: null,
    longitude: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

const BGC = makeOutlet({ id: 'bgc', latitude: 14.5507, longitude: 121.047, sort_order: 2 })
const QC = makeOutlet({ id: 'qc', latitude: 14.676, longitude: 121.0437, sort_order: 1 })
const CAVITE = makeOutlet({ id: 'cavite', latitude: 14.279, longitude: 120.86, sort_order: 3 })

const ids = (result: { outlets: Array<{ outlet: OutletLocation }> }) =>
  result.outlets.map((entry) => entry.outlet.id)

describe('rankOutlets — filtering', () => {
  it('drops inactive outlets', () => {
    const inactive = makeOutlet({ id: 'closed', is_active: false })
    const result = rankOutlets([BGC, inactive], { mode: 'pickup', origin: MAKATI })
    expect(ids(result)).toEqual(['bgc'])
  })

  it('drops outlets that do not support the chosen order mode', () => {
    const pickupOnly = makeOutlet({ id: 'pickup-only', supports_delivery: false, sort_order: 1 })
    const deliveryOnly = makeOutlet({ id: 'delivery-only', supports_pickup: false, sort_order: 2 })

    expect(ids(rankOutlets([pickupOnly, deliveryOnly], { mode: 'pickup' }))).toEqual(['pickup-only'])
    expect(ids(rankOutlets([pickupOnly, deliveryOnly], { mode: 'delivery' }))).toEqual([
      'delivery-only',
    ])
  })

  it('returns an empty, unselected result when nothing survives filtering', () => {
    const result = rankOutlets([makeOutlet({ id: 'x', is_active: false })], { mode: 'pickup' })
    expect(result.outlets).toEqual([])
    expect(result.preselectedId).toBeNull()
    expect(result.anyWithinDeliveryRadius).toBe(false)
  })

  it('returns an empty result for an empty input list', () => {
    const result = rankOutlets([], { mode: 'pickup', origin: MAKATI })
    expect(result.outlets).toEqual([])
    expect(result.preselectedId).toBeNull()
  })
})

describe('rankOutlets — without a usable location', () => {
  it('falls back to sort_order when no origin is supplied (permission denied / timed out)', () => {
    const result = rankOutlets([BGC, QC, CAVITE], { mode: 'pickup' })
    expect(ids(result)).toEqual(['qc', 'bgc', 'cavite'])
  })

  it('treats a null origin the same as no origin', () => {
    const result = rankOutlets([BGC, QC, CAVITE], { mode: 'pickup', origin: null })
    expect(ids(result)).toEqual(['qc', 'bgc', 'cavite'])
  })

  it('reports null distances when the customer location is unknown', () => {
    const result = rankOutlets([BGC, QC], { mode: 'pickup' })
    expect(result.outlets.every((entry) => entry.distanceKm === null)).toBe(true)
  })

  it('does not preselect anything when several outlets are available and location is unknown', () => {
    const result = rankOutlets([BGC, QC], { mode: 'pickup' })
    expect(result.preselectedId).toBeNull()
  })

  it('still preselects when exactly one outlet is available', () => {
    const result = rankOutlets([BGC], { mode: 'pickup' })
    expect(result.preselectedId).toBe('bgc')
  })

  it('ignores an origin with out-of-range or non-finite coordinates', () => {
    const bogus = [
      { latitude: 999, longitude: 121 },
      { latitude: 14.5, longitude: 999 },
      { latitude: Number.NaN, longitude: 121 },
    ]
    for (const origin of bogus) {
      const result = rankOutlets([BGC, QC], { mode: 'pickup', origin })
      expect(ids(result)).toEqual(['qc', 'bgc'])
      expect(result.preselectedId).toBeNull()
    }
  })
})

describe('rankOutlets — pickup with a known location', () => {
  it('sorts by distance ascending and preselects the nearest', () => {
    const result = rankOutlets([CAVITE, QC, BGC], { mode: 'pickup', origin: MAKATI })
    expect(ids(result)).toEqual(['bgc', 'qc', 'cavite'])
    expect(result.preselectedId).toBe('bgc')
  })

  it('reports a plausible distance for each outlet', () => {
    const result = rankOutlets([BGC], { mode: 'pickup', origin: MAKATI })
    expect(result.outlets[0].distanceKm).toBeCloseTo(2.4, 0)
  })

  it('ignores delivery radius entirely for pickup', () => {
    const far = makeOutlet({ ...CAVITE, delivery_radius_km: 1 })
    const result = rankOutlets([far], { mode: 'pickup', origin: MAKATI })
    expect(result.preselectedId).toBe('cavite')
    expect(result.outlets[0].withinDeliveryRadius).toBe(true)
  })

  it('sinks outlets with missing coordinates below located ones, ordered by sort_order', () => {
    const noCoordsA = makeOutlet({ id: 'no-coords-a', latitude: null, longitude: null, sort_order: 9 })
    const noCoordsB = makeOutlet({ id: 'no-coords-b', latitude: null, longitude: null, sort_order: 4 })
    const result = rankOutlets([noCoordsA, noCoordsB, BGC], { mode: 'pickup', origin: MAKATI })
    expect(ids(result)).toEqual(['bgc', 'no-coords-b', 'no-coords-a'])
    expect(result.outlets[1].distanceKm).toBeNull()
  })

  it('never preselects an outlet with unknown coordinates when a located one exists', () => {
    const noCoords = makeOutlet({ id: 'no-coords', sort_order: 0 })
    const result = rankOutlets([noCoords, BGC], { mode: 'pickup', origin: MAKATI })
    expect(result.preselectedId).toBe('bgc')
  })

  it('breaks exact distance ties by sort_order, then id — deterministically', () => {
    const twinLow = makeOutlet({ id: 'twin-low', ...MAKATI, sort_order: 1 })
    const twinHigh = makeOutlet({ id: 'twin-high', ...MAKATI, sort_order: 5 })
    const result = rankOutlets([twinHigh, twinLow], { mode: 'pickup', origin: MAKATI })
    expect(ids(result)).toEqual(['twin-low', 'twin-high'])
    expect(result.preselectedId).toBe('twin-low')
  })

  it('breaks ties by id when sort_order is also equal', () => {
    const a = makeOutlet({ id: 'aaa', ...MAKATI, sort_order: 1 })
    const b = makeOutlet({ id: 'bbb', ...MAKATI, sort_order: 1 })
    expect(ids(rankOutlets([b, a], { mode: 'pickup', origin: MAKATI }))).toEqual(['aaa', 'bbb'])
  })
})

describe('rankOutlets — delivery radius', () => {
  it('marks outlets whose radius covers the customer and preselects the nearest of them', () => {
    const near = makeOutlet({ ...BGC, delivery_radius_km: 5 })
    const far = makeOutlet({ ...QC, delivery_radius_km: 20 })
    const result = rankOutlets([far, near], { mode: 'delivery', origin: MAKATI })

    expect(result.anyWithinDeliveryRadius).toBe(true)
    expect(result.preselectedId).toBe('bgc')
    expect(result.outlets.map((entry) => entry.withinDeliveryRadius)).toEqual([true, true])
  })

  it('prefers a covering outlet over a nearer one that does not reach', () => {
    const nearButTiny = makeOutlet({ ...BGC, delivery_radius_km: 0.5 })
    const fartherButCovering = makeOutlet({ ...QC, delivery_radius_km: 20 })
    const result = rankOutlets([nearButTiny, fartherButCovering], {
      mode: 'delivery',
      origin: MAKATI,
    })

    expect(ids(result)).toEqual(['bgc', 'qc'])
    expect(result.preselectedId).toBe('qc')
  })

  it('preselects nothing when no outlet covers the customer, but still lists them all', () => {
    const a = makeOutlet({ ...BGC, delivery_radius_km: 0.5 })
    const b = makeOutlet({ ...QC, delivery_radius_km: 1 })
    const result = rankOutlets([a, b], { mode: 'delivery', origin: MAKATI })

    expect(ids(result)).toEqual(['bgc', 'qc'])
    expect(result.anyWithinDeliveryRadius).toBe(false)
    expect(result.preselectedId).toBeNull()
  })

  it('treats a blank radius as unrestricted, matching the tenant-level opt-in default', () => {
    const noRadius = makeOutlet({ ...BGC, delivery_radius_km: null })
    const result = rankOutlets([noRadius], { mode: 'delivery', origin: MAKATI })
    expect(result.outlets[0].withinDeliveryRadius).toBe(true)
    expect(result.anyWithinDeliveryRadius).toBe(true)
  })

  it('treats a zero or negative radius as unrestricted rather than as "delivers nowhere"', () => {
    for (const radius of [0, -5]) {
      const outlet = makeOutlet({ ...BGC, delivery_radius_km: radius })
      const result = rankOutlets([outlet], { mode: 'delivery', origin: MAKATI })
      expect(result.outlets[0].withinDeliveryRadius).toBe(true)
    }
  })

  it('counts an outlet exactly on the radius boundary as covered', () => {
    const distanceKm = rankOutlets([BGC], { mode: 'delivery', origin: MAKATI }).outlets[0].distanceKm
    const exact = makeOutlet({ ...BGC, delivery_radius_km: distanceKm as number })
    const result = rankOutlets([exact], { mode: 'delivery', origin: MAKATI })
    expect(result.outlets[0].withinDeliveryRadius).toBe(true)
  })

  it('cannot judge coverage without a location, so it reports none within radius', () => {
    const result = rankOutlets([makeOutlet({ ...BGC, delivery_radius_km: 5 })], {
      mode: 'delivery',
    })
    expect(result.anyWithinDeliveryRadius).toBe(false)
    expect(result.outlets[0].withinDeliveryRadius).toBe(false)
  })

  it('preselects a lone delivery outlet even when it is out of range, so checkout can warn', () => {
    // One choice is not a choice; the customer still needs the address form to
    // tell them delivery does not reach. Selection stays overridable.
    const outOfRange = makeOutlet({ ...CAVITE, delivery_radius_km: 1 })
    const result = rankOutlets([outOfRange], { mode: 'delivery', origin: MAKATI })
    expect(result.preselectedId).toBe('cavite')
    expect(result.anyWithinDeliveryRadius).toBe(false)
  })
})

describe('rankOutlets — purity', () => {
  it('does not mutate or reorder the caller list', () => {
    const input = [CAVITE, QC, BGC]
    const snapshot = input.map((outlet) => outlet.id)
    rankOutlets(input, { mode: 'pickup', origin: MAKATI })
    expect(input.map((outlet) => outlet.id)).toEqual(snapshot)
  })

  it('does not mutate the outlet objects it ranks', () => {
    const frozen = Object.freeze(makeOutlet({ id: 'frozen', ...MAKATI }))
    expect(() => rankOutlets([frozen], { mode: 'pickup', origin: MAKATI })).not.toThrow()
  })
})
