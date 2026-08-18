import { describe, it, expect } from '@jest/globals'
import {
  readOutletSelection,
  writeOutletSelection,
  resolveOutletSelection,
  type SelectableOutlet,
  type StorageLike,
} from '@/lib/outlets/outlet-selection'
import { rankOutlets } from '@/lib/outlets/nearest-outlet'

/**
 * The welcome page's single-CTA entry sends the customer straight to the
 * branch list without asking how they want their order. That selection has a
 * branch but NO mode — the order type is asked at checkout, exactly as the
 * 'after' timing already does. These tests pin the mode-less selection through
 * storage, resolution and ranking.
 */

function memoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

const outlet = (id: string, overrides: Partial<SelectableOutlet> = {}): SelectableOutlet => ({
  id,
  slug: id,
  name: id,
  latitude: null,
  longitude: null,
  delivery_radius_km: null,
  supports_pickup: true,
  supports_delivery: true,
  supports_dine_in: false,
  is_active: true,
  sort_order: 0,
  ...overrides,
})

const NOW = 1_755_000_000_000

describe('mode-less stored selection (single-CTA entry)', () => {
  it('round-trips a selection whose mode is null', () => {
    const storage = memoryStorage()
    writeOutletSelection(storage, 'demo', { outletId: 'a', mode: null }, NOW)
    expect(readOutletSelection(storage, 'demo', NOW)).toEqual({ outletId: 'a', mode: null })
  })

  it('still rejects a selection whose mode is garbage', () => {
    const storage = memoryStorage()
    storage.setItem(
      'selected_outlet_demo',
      JSON.stringify({ outletId: 'a', mode: 'teleport', savedAt: NOW })
    )
    expect(readOutletSelection(storage, 'demo', NOW)).toBeNull()
  })

  it('keeps a remembered branch with no mode instead of re-prompting forever', () => {
    const resolution = resolveOutletSelection({
      isEnabled: true,
      outlets: [outlet('a'), outlet('b')],
      stored: { outletId: 'a', mode: null },
      urlSlug: null,
    })
    expect(resolution.shouldPrompt).toBe(false)
    expect(resolution.outlet?.id).toBe('a')
    expect(resolution.mode).toBeNull()
  })

  it('still drops a mode-less selection whose branch disappeared', () => {
    const resolution = resolveOutletSelection({
      isEnabled: true,
      outlets: [outlet('b'), outlet('c')],
      stored: { outletId: 'gone', mode: null },
      urlSlug: null,
    })
    expect(resolution.shouldPrompt).toBe(true)
    expect(resolution.reason).toBe('outlet-unavailable')
  })
})

describe('rankOutlets with no mode (single-CTA branch list)', () => {
  it('offers every active branch regardless of which modes it supports', () => {
    const pickupOnly = outlet('pickup-only', { supports_delivery: false })
    const dineInOnly = outlet('dine-in-only', {
      supports_pickup: false,
      supports_delivery: false,
      supports_dine_in: true,
    })
    const inactive = outlet('inactive', { is_active: false })

    const result = rankOutlets([pickupOnly, dineInOnly, inactive], { mode: null, origin: null })
    // Unlocated branches fall back to manual order, then id — hence the sort.
    expect(result.outlets.map((entry) => entry.outlet.id)).toEqual(['dine-in-only', 'pickup-only'])
  })

  it('never flags a mode-less branch as out of delivery range', () => {
    const limited = outlet('limited', { delivery_radius_km: 1, latitude: 14.6, longitude: 121.0 })
    const result = rankOutlets([limited, outlet('b')], {
      mode: null,
      origin: { latitude: 14.7, longitude: 121.1 },
    })
    expect(result.outlets.every((entry) => entry.withinDeliveryRadius)).toBe(true)
  })

  it('preselects the nearest located branch, like pickup does', () => {
    const near = outlet('near', { latitude: 14.61, longitude: 121.01 })
    const far = outlet('far', { latitude: 15.5, longitude: 122.0 })
    const result = rankOutlets([far, near], {
      mode: null,
      origin: { latitude: 14.6, longitude: 121.0 },
    })
    expect(result.preselectedId).toBe('near')
  })
})
