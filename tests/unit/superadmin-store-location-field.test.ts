import {
  applyStoreLocationChange,
  parseCoordinateInput,
} from '@/components/superadmin/tenant-form-wrapper'

/**
 * The superadmin tenant form's address box is a `MapboxAddressAutocomplete`,
 * which reports `onChange(address)` with NO coordinates on every keystroke and
 * supplies them only when a suggestion is picked or a pin is dropped.
 *
 * The form used to write `coordinates?.lat.toString() || ''` unconditionally,
 * so typing a single character into the address of a tenant that already had a
 * pinned store location erased that location. The save then failed the
 * distance-delivery rule ("Store location is required …") — which is the
 * production crash this file guards (Sentry JAVASCRIPT-NEXTJS-2X).
 */

// Only the three fields the merge touches matter; the rest of the form state is
// stubbed so a failure here is about coordinates, not fixture drift.
const SAVED_LOCATION = {
  restaurant_address: 'B. Soliven Street, Quezon City',
  restaurant_latitude: '14.70229531',
  restaurant_longitude: '121.08885574',
  name: 'Shak-Owl',
  distance_delivery_enabled: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('applyStoreLocationChange', () => {
  it('keeps the pinned coordinates while the address text is being edited', () => {
    // Arrange: the autocomplete reports a keystroke with no coordinates.
    // Act
    const next = applyStoreLocationChange(SAVED_LOCATION, 'B. Soliven Street, Quezon Cit')

    // Assert: the store is still pinned where it was.
    expect(next.restaurant_latitude).toBe('14.70229531')
    expect(next.restaurant_longitude).toBe('121.08885574')
    expect(next.restaurant_address).toBe('B. Soliven Street, Quezon Cit')
  })

  it('replaces the coordinates when the picker supplies new ones', () => {
    // Arrange
    const coordinates = { lat: 10.3157, lng: 123.8854 }

    // Act
    const next = applyStoreLocationChange(SAVED_LOCATION, 'Cebu City', coordinates)

    // Assert
    expect(next.restaurant_latitude).toBe('10.3157')
    expect(next.restaurant_longitude).toBe('123.8854')
    expect(next.restaurant_address).toBe('Cebu City')
  })

  it('does not mutate the form state it was handed', () => {
    // Act
    applyStoreLocationChange(SAVED_LOCATION, 'Somewhere else')

    // Assert
    expect(SAVED_LOCATION.restaurant_address).toBe('B. Soliven Street, Quezon City')
  })
})

describe('parseCoordinateInput', () => {
  it('reads a pinned coordinate', () => {
    expect(parseCoordinateInput('14.70229531')).toBe(14.70229531)
  })

  it('keeps 0, which is a real latitude rather than a missing one', () => {
    expect(parseCoordinateInput('0')).toBe(0)
  })

  it('treats a blank field as unset', () => {
    expect(parseCoordinateInput('')).toBeUndefined()
    expect(parseCoordinateInput('   ')).toBeUndefined()
  })

  it('treats an unparseable value as unset rather than sending NaN to the schema', () => {
    // NaN reaches Zod as "expected number, received nan" — a confusing refusal
    // for what is really an empty field.
    expect(parseCoordinateInput('not-a-number')).toBeUndefined()
  })
})
