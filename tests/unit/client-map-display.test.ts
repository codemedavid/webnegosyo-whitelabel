import {
  appleMapsUrl,
  externalMapsLink,
  formatClientTenure,
  initialsOf,
  pinSizeForCameraDistance,
  shortLocality,
} from '@/lib/superadmin/client-map/display'

describe('shortLocality', () => {
  it('keeps the city and province, dropping country and postal codes', () => {
    expect(shortLocality('Brgy. Sampaga, Balayan, Batangas, Philippines, 4213')).toBe('Balayan, Batangas')
  })

  it('collapses a repeated city', () => {
    expect(shortLocality('186b JP Rizal, Quezon City, Quezon City, Philippines')).toBe('186b JP Rizal, Quezon City')
  })

  it('handles single-part and empty addresses', () => {
    expect(shortLocality('Metro Manila')).toBe('Metro Manila')
    expect(shortLocality(null)).toBeNull()
    expect(shortLocality('Philippines')).toBeNull()
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Kape Tayo Cafe')).toBe('KT')
    expect(initialsOf('  baksilog ')).toBe('B')
    expect(initialsOf('11.21 CAFE & CHILL')).toBe('1C')
    expect(initialsOf('')).toBe('?')
  })
})

describe('formatClientTenure', () => {
  const now = new Date('2026-09-24T00:00:00Z')

  it('describes days, months and years', () => {
    expect(formatClientTenure('2026-09-20T00:00:00Z', now)).toBe('4 days')
    expect(formatClientTenure('2026-09-24T00:00:00Z', now)).toBe('Joined today')
    expect(formatClientTenure('2026-06-01T00:00:00Z', now)).toBe('3 months')
    expect(formatClientTenure('2025-08-01T00:00:00Z', now)).toBe('1 year')
    expect(formatClientTenure('2024-01-01T00:00:00Z', now)).toBe('2 years')
  })

  it('returns null for an unparseable date', () => {
    expect(formatClientTenure('nope', now)).toBeNull()
  })
})

describe('externalMapsLink', () => {
  const pin = { name: 'Kape & Tayo Café', lat: 13.94, lng: 120.73 }

  it('links to Apple Maps with the encoded store name and its coordinate when the provider is apple', () => {
    // Act
    const link = externalMapsLink(pin, 'apple')

    // Assert
    expect(link).toEqual({
      href: 'https://maps.apple.com/?q=Kape%20%26%20Tayo%20Caf%C3%A9&ll=13.94,120.73',
      label: 'Open in Apple Maps',
    })
  })

  it('keeps the Google Maps coordinate search when the provider is mapbox', () => {
    // Act
    const link = externalMapsLink(pin, 'mapbox')

    // Assert
    expect(link).toEqual({
      href: 'https://www.google.com/maps/search/?api=1&query=13.94,120.73',
      label: 'Open in Google Maps',
    })
  })
})

describe('appleMapsUrl', () => {
  it('encodes characters that would otherwise break the query string', () => {
    // Arrange
    const pin = { name: 'Lomi #1 ?=Batangas', lat: 14, lng: 121 }

    // Act
    const url = appleMapsUrl(pin)

    // Assert
    expect(url).toBe('https://maps.apple.com/?q=Lomi%20%231%20%3F%3DBatangas&ll=14,121')
  })
})

describe('pinSizeForCameraDistance', () => {
  it('draws small logos while the whole country is in view', () => {
    expect(pinSizeForCameraDistance(2_000_000)).toBe(30)
    expect(pinSizeForCameraDistance(300_000)).toBe(30)
  })

  it('draws medium logos at city level', () => {
    expect(pinSizeForCameraDistance(299_999)).toBe(38)
    expect(pinSizeForCameraDistance(20_000)).toBe(38)
  })

  it('draws full-size logos at street level', () => {
    expect(pinSizeForCameraDistance(19_999)).toBe(46)
    expect(pinSizeForCameraDistance(900)).toBe(46)
  })

  it('falls back to the small country-view size for an unusable distance', () => {
    expect(pinSizeForCameraDistance(Number.NaN)).toBe(30)
  })
})
