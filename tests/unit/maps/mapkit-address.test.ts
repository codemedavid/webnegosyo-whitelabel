import {
  autocompleteLabel,
  formatPlaceAddress,
  parseCoordinateFallback,
  parseLatLng,
  placeToSelection,
} from '@/lib/maps/apple/mapkit-address'

const coordinate = { latitude: 14.5547, longitude: 121.0244 }

describe('formatPlaceAddress', () => {
  it('prefixes a point of interest name to its street address', () => {
    expect(
      formatPlaceAddress({
        name: 'Greenbelt 5',
        coordinate,
        formattedAddress: 'Legazpi St, Makati, 1223 Metro Manila, Philippines',
        pointOfInterestCategory: 'Store',
      }),
    ).toBe('Greenbelt 5, Legazpi St, Makati, 1223 Metro Manila, Philippines')
  })

  it('does not repeat a name the address already starts with', () => {
    expect(
      formatPlaceAddress({
        name: '6780 Ayala Ave',
        coordinate,
        formattedAddress: '6780 Ayala Ave, Makati, Metro Manila, Philippines',
      }),
    ).toBe('6780 Ayala Ave, Makati, Metro Manila, Philippines')
  })

  it('builds an address from its parts when Apple sends no formatted address', () => {
    expect(
      formatPlaceAddress({
        coordinate,
        fullThoroughfare: '12 Rizal St',
        subLocality: 'Poblacion',
        locality: 'Makati',
        administrativeArea: 'Metro Manila',
        country: 'Philippines',
      }),
    ).toBe('12 Rizal St, Poblacion, Makati, Metro Manila, Philippines')
  })

  it('falls back to readable coordinates when nothing else is known', () => {
    expect(formatPlaceAddress({ coordinate })).toBe('Lat: 14.554700, Lng: 121.024400')
  })
})

it('flattens an address Apple sends on several lines into one', () => {
  expect(
    formatPlaceAddress({
      name: 'SM Mall of Asia',
      coordinate,
      formattedAddress: 'Seaside Blvd\nPasay City\n1308 Metro Manila\nPhilippines',
    }),
  ).toBe('SM Mall of Asia, Seaside Blvd, Pasay City, 1308 Metro Manila, Philippines')
})

describe('placeToSelection', () => {
  it('returns the address with lat/lng coordinates', () => {
    expect(placeToSelection({ coordinate, formattedAddress: 'Makati, Philippines' })).toEqual({
      address: 'Makati, Philippines',
      coordinates: { lat: 14.5547, lng: 121.0244 },
    })
  })

  it('rejects a place with impossible coordinates', () => {
    expect(placeToSelection({ coordinate: { latitude: Number.NaN, longitude: 1 } })).toBeNull()
    expect(placeToSelection({ coordinate: { latitude: 91, longitude: 1 } })).toBeNull()
  })
})

describe('autocompleteLabel', () => {
  it('joins the display lines Apple returns', () => {
    expect(autocompleteLabel({ displayLines: ['SM Mall of Asia', 'Pasay, Metro Manila'] })).toBe(
      'SM Mall of Asia, Pasay, Metro Manila',
    )
    expect(autocompleteLabel({ displayLines: ['  ', 'Makati'] })).toBe('Makati')
  })
})

describe('parseCoordinateFallback', () => {
  it('reads coordinates back out of a fallback address', () => {
    expect(parseCoordinateFallback('Lat: 14.5547, Lng: 121.0244')).toEqual({ lat: 14.5547, lng: 121.0244 })
    expect(parseCoordinateFallback('Makati')).toBeNull()
  })
})

describe('parseLatLng', () => {
  it('reads numbers and numeric strings, keeping a zero coordinate', () => {
    expect(parseLatLng(14.5, '121.02')).toEqual({ lat: 14.5, lng: 121.02 })
    expect(parseLatLng('0', '0')).toEqual({ lat: 0, lng: 0 })
  })

  it('is null for a missing half, junk, or an impossible pair', () => {
    expect(parseLatLng('', '121')).toBeNull()
    expect(parseLatLng(null, 121)).toBeNull()
    expect(parseLatLng('abc', '121')).toBeNull()
    expect(parseLatLng(120, 121)).toBeNull()
  })
})
