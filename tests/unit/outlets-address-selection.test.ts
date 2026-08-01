import { describe, it, expect } from '@jest/globals'
import {
  applyOutletAddressSelection,
  clearOutletCoordinates,
} from '@/lib/outlets/outlet-form'
import { EMPTY_OUTLET_DRAFT } from '@/lib/outlets/outlet-form'

/**
 * Pinning a branch on the map.
 *
 * The branch form asked merchants to type latitude and longitude by hand. That
 * is why "the location isn't working": the database enforces
 * `outlets_coordinates_paired_ck`, so a merchant who types a latitude and tabs
 * away has not entered a partial location — they have made the entire branch
 * unsaveable, and the error names a constraint rather than the field.
 *
 * The fix is to stop asking. `MapboxAddressAutocomplete` — already used by the
 * delivery settings form — hands back an address and its coordinates together,
 * so the pair can only ever be set as a pair.
 *
 * Two rules matter and both come from how that component behaves: it fires on
 * every keystroke with no coordinates, and only on a *picked* result with them.
 * So a keystroke must not wipe a pin the merchant already dropped, and a picked
 * result must replace it.
 */

const PINNED = {
  ...EMPTY_OUTLET_DRAFT,
  address: '123 Old Street',
  latitude: '14.550000',
  longitude: '121.050000',
}

describe('applyOutletAddressSelection — picking a result', () => {
  it('records the address and both coordinates together', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'BGC High Street', {
      lat: 14.5507,
      lng: 121.0494,
    })
    expect(next.address).toBe('BGC High Street')
    expect(next.latitude).toBe('14.5507')
    expect(next.longitude).toBe('121.0494')
  })

  it('replaces a previous pin when a new address is picked', () => {
    const next = applyOutletAddressSelection(PINNED, 'New Place', { lat: 10.3157, lng: 123.8854 })
    expect(next.latitude).toBe('10.3157')
    expect(next.longitude).toBe('123.8854')
  })

  it('leaves the rest of the branch untouched', () => {
    const draft = { ...PINNED, name: 'Annex', slug: 'annex', supports_delivery: false }
    const next = applyOutletAddressSelection(draft, 'Somewhere', { lat: 1, lng: 2 })
    expect(next.name).toBe('Annex')
    expect(next.slug).toBe('annex')
    expect(next.supports_delivery).toBe(false)
  })

  it('does not mutate the draft it was given', () => {
    const draft = { ...PINNED }
    applyOutletAddressSelection(draft, 'Somewhere', { lat: 1, lng: 2 })
    expect(draft.address).toBe('123 Old Street')
    expect(draft.latitude).toBe('14.550000')
  })
})

describe('applyOutletAddressSelection — typing', () => {
  it('keeps an existing pin while the merchant edits the text', () => {
    // The autocomplete fires on every keystroke with no coordinates. Clearing
    // here would destroy the pin as soon as someone corrected a typo.
    const next = applyOutletAddressSelection(PINNED, '123 Old Street, Unit 4')
    expect(next.address).toBe('123 Old Street, Unit 4')
    expect(next.latitude).toBe('14.550000')
    expect(next.longitude).toBe('121.050000')
  })

  it('records a typed address for a branch that was never pinned', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Somewhere with no pin')
    expect(next.address).toBe('Somewhere with no pin')
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })
})

describe('applyOutletAddressSelection — never half a pair', () => {
  it('ignores a selection missing its longitude', () => {
    // Half a pair is what the database rejects outright, so it must be
    // impossible to produce from the form.
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Nowhere', {
      lat: 14.5,
      lng: undefined as unknown as number,
    })
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })

  it('ignores a selection missing its latitude', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Nowhere', {
      lat: undefined as unknown as number,
      lng: 121.05,
    })
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })

  it('ignores coordinates that are not finite numbers', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Nowhere', {
      lat: Number.NaN,
      lng: 121.05,
    })
    expect(next.latitude).toBe('')
  })

  it('ignores an out-of-range latitude rather than saving an unsaveable branch', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Nowhere', { lat: 99, lng: 121.05 })
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })

  it('ignores an out-of-range longitude', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Nowhere', { lat: 14.5, lng: 181 })
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })

  it('accepts the exact boundary coordinates', () => {
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Edge', { lat: -90, lng: 180 })
    expect(next.latitude).toBe('-90')
    expect(next.longitude).toBe('180')
  })

  it('accepts a genuine zero coordinate', () => {
    // 0,0 is a real place; a falsy check would silently drop it.
    const next = applyOutletAddressSelection(EMPTY_OUTLET_DRAFT, 'Null Island', { lat: 0, lng: 0 })
    expect(next.latitude).toBe('0')
    expect(next.longitude).toBe('0')
  })
})

describe('clearOutletCoordinates', () => {
  it('removes both halves of the pin at once', () => {
    const next = clearOutletCoordinates(PINNED)
    expect(next.latitude).toBe('')
    expect(next.longitude).toBe('')
  })

  it('keeps the address the merchant typed', () => {
    const next = clearOutletCoordinates(PINNED)
    expect(next.address).toBe('123 Old Street')
  })

  it('does not mutate the draft it was given', () => {
    const draft = { ...PINNED }
    clearOutletCoordinates(draft)
    expect(draft.latitude).toBe('14.550000')
  })
})
