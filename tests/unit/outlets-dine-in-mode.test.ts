import { describe, it, expect } from '@jest/globals'
import { rankOutlets, type OutletLocation } from '@/lib/outlets/nearest-outlet'
import { resolveOutletSelection, type SelectableOutlet } from '@/lib/outlets/outlet-selection'
import { resolveAvailableModes, OUTLET_MODE_LABELS } from '@/lib/outlets/outlet-modes'

/**
 * Dine-in is a third way to receive an order, not a variant of pickup.
 *
 * The distinction that matters: a branch you *sit in* can be offered without a
 * delivery radius and without the branch supporting takeaway at all. Treating
 * it as pickup would let a dine-in-only branch disappear from a pickup list, or
 * a delivery radius silently disqualify a customer already standing in the shop.
 */

function makeOutlet(overrides: Partial<OutletLocation> & { id: string }): OutletLocation {
  return {
    slug: overrides.id,
    name: overrides.id,
    latitude: null,
    longitude: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

function makeSelectable(
  overrides: Partial<SelectableOutlet> & { id: string }
): SelectableOutlet {
  return {
    slug: overrides.id,
    name: overrides.id,
    latitude: null,
    longitude: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

const MAKATI = { latitude: 14.5547, longitude: 121.0244 }

describe('rankOutlets — dine_in mode', () => {
  it('lists only branches that support dine-in', () => {
    // Arrange
    const sitDown = makeOutlet({ id: 'sit-down', supports_dine_in: true })
    const takeawayOnly = makeOutlet({ id: 'kiosk', supports_dine_in: false })

    // Act
    const result = rankOutlets([sitDown, takeawayOnly], { mode: 'dine_in' })

    // Assert
    expect(result.outlets.map((entry) => entry.outlet.id)).toEqual(['sit-down'])
  })

  it('offers a dine-in branch that does not support pickup at all', () => {
    // A restaurant with table service and no takeaway counter is a real shape,
    // and the DB constraint permits it once dine-in counts as fulfillment.
    const dineInOnly = makeOutlet({
      id: 'fine-dining',
      supports_pickup: false,
      supports_delivery: false,
      supports_dine_in: true,
    })

    const result = rankOutlets([dineInOnly], { mode: 'dine_in' })

    expect(result.outlets.map((entry) => entry.outlet.id)).toEqual(['fine-dining'])
  })

  it('never treats a delivery radius as a dine-in limit', () => {
    // Cavite is ~35 km from Makati and delivers only 2 km — but the customer is
    // proposing to walk in and sit down, so the radius is irrelevant.
    const faraway = makeOutlet({
      id: 'cavite',
      latitude: 14.279,
      longitude: 120.86,
      delivery_radius_km: 2,
      supports_dine_in: true,
    })

    const result = rankOutlets([faraway], { mode: 'dine_in', origin: MAKATI })

    expect(result.outlets[0].withinDeliveryRadius).toBe(true)
  })

  it('ranks dine-in branches by distance when a location is known', () => {
    const near = makeOutlet({
      id: 'bgc',
      latitude: 14.5507,
      longitude: 121.047,
      sort_order: 9,
      supports_dine_in: true,
    })
    const far = makeOutlet({
      id: 'qc',
      latitude: 14.676,
      longitude: 121.0437,
      sort_order: 1,
      supports_dine_in: true,
    })

    const result = rankOutlets([far, near], { mode: 'dine_in', origin: MAKATI })

    expect(result.outlets.map((entry) => entry.outlet.id)).toEqual(['bgc', 'qc'])
  })
})

describe('resolveOutletSelection — dine_in mode', () => {
  const two = [
    makeSelectable({ id: 'a', sort_order: 1, supports_dine_in: true }),
    makeSelectable({ id: 'b', sort_order: 2, supports_dine_in: false }),
  ]

  it('honours a stored dine-in choice at a branch that still seats customers', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: two,
      stored: { outletId: 'a', mode: 'dine_in' },
      urlSlug: null,
    })

    expect(result.shouldPrompt).toBe(false)
    expect(result.outlet?.id).toBe('a')
    expect(result.mode).toBe('dine_in')
  })

  it('asks again when the remembered branch stopped offering dine-in', () => {
    const result = resolveOutletSelection({
      isEnabled: true,
      outlets: two,
      stored: { outletId: 'b', mode: 'dine_in' },
      urlSlug: null,
    })

    expect(result.shouldPrompt).toBe(true)
    expect(result.reason).toBe('mode-unsupported')
    expect(result.shouldClearStorage).toBe(true)
  })
})

describe('resolveAvailableModes', () => {
  it('offers only the modes at least one active branch supports', () => {
    const outlets = [
      makeSelectable({ id: 'a', supports_pickup: true, supports_delivery: false }),
      makeSelectable({ id: 'b', supports_pickup: false, supports_delivery: false, supports_dine_in: true }),
    ]

    expect(resolveAvailableModes(outlets)).toEqual(['dine_in', 'pickup'])
  })

  it('ignores inactive branches when deciding what to offer', () => {
    const outlets = [
      makeSelectable({ id: 'live', supports_pickup: true, supports_delivery: false }),
      makeSelectable({ id: 'dead', is_active: false, supports_delivery: true, supports_dine_in: true }),
    ]

    expect(resolveAvailableModes(outlets)).toEqual(['pickup'])
  })

  it('returns an empty list rather than throwing when there are no branches', () => {
    expect(resolveAvailableModes([])).toEqual([])
  })

  it('orders the tiles dine-in, pickup, delivery so the screen never reshuffles', () => {
    const all = [makeSelectable({ id: 'a', supports_dine_in: true })]

    expect(resolveAvailableModes(all)).toEqual(['dine_in', 'pickup', 'delivery'])
  })

  it('labels every mode it can return', () => {
    const all = [makeSelectable({ id: 'a', supports_dine_in: true })]

    for (const mode of resolveAvailableModes(all)) {
      expect(OUTLET_MODE_LABELS[mode]).toBeTruthy()
    }
  })
})
