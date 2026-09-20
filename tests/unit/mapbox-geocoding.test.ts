import {
  buildReverseGeocodeUrl,
  parseGeocodeFeatures,
  parseReverseGeocodeAddress,
  formatCoordinateFallback,
  reverseGeocodeAddress,
} from '@/lib/geocoding/mapbox-geocoding'

const TOKEN = 'pk.test-token'

const addressFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [121.0437, 14.676] },
  properties: {
    name: '123 Katipunan Avenue',
    full_address: '123 Katipunan Avenue, Quezon City, Metro Manila, Philippines',
    place_formatted: 'Quezon City, Metro Manila, Philippines',
    coordinates: { longitude: 121.0437, latitude: 14.676, accuracy: 'rooftop' },
    feature_type: 'address',
  },
}

describe('buildReverseGeocodeUrl', () => {
  test('targets the v6 reverse endpoint with discrete latitude and longitude params', () => {
    const url = new URL(buildReverseGeocodeUrl(14.676, 121.0437, TOKEN))

    expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/geocode/v6/reverse')
    expect(url.searchParams.get('latitude')).toBe('14.676')
    expect(url.searchParams.get('longitude')).toBe('121.0437')
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
  })
})

describe('parseGeocodeFeatures', () => {
  test('maps a feature to its full address and [lng, lat] coordinates', () => {
    const results = parseGeocodeFeatures({ features: [addressFeature] })

    expect(results).toEqual([
      {
        place_name: '123 Katipunan Avenue, Quezon City, Metro Manila, Philippines',
        coordinates: [121.0437, 14.676],
      },
    ])
  })

  test('composes name and place context when full_address is absent', () => {
    const poi = {
      geometry: { type: 'Point', coordinates: [120.9842, 14.5995] },
      properties: {
        name: 'Rizal Park',
        place_formatted: 'Manila, Metro Manila, Philippines',
        coordinates: { longitude: 120.9842, latitude: 14.5995 },
      },
    }

    const results = parseGeocodeFeatures({ features: [poi] })

    expect(results[0].place_name).toBe('Rizal Park, Manila, Metro Manila, Philippines')
  })

  test('falls back to the bare name when no place context is available', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [120.9842, 14.5995] },
      properties: { name: 'Rizal Park' },
    }

    const results = parseGeocodeFeatures({ features: [feature] })

    expect(results[0].place_name).toBe('Rizal Park')
  })

  test('reads coordinates from geometry when properties.coordinates is missing', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [120.9842, 14.5995] },
      properties: { full_address: 'Rizal Park, Manila' },
    }

    const results = parseGeocodeFeatures({ features: [feature] })

    expect(results[0].coordinates).toEqual([120.9842, 14.5995])
  })

  test('drops features that carry no usable coordinates', () => {
    const feature = { properties: { full_address: 'Somewhere' } }

    expect(parseGeocodeFeatures({ features: [feature, addressFeature] })).toHaveLength(1)
  })

  test('drops features that carry no usable label', () => {
    const feature = {
      geometry: { type: 'Point', coordinates: [120.9842, 14.5995] },
      properties: {},
    }

    expect(parseGeocodeFeatures({ features: [feature] })).toEqual([])
  })

  test('returns an empty array for an empty, malformed or missing payload', () => {
    expect(parseGeocodeFeatures({ features: [] })).toEqual([])
    expect(parseGeocodeFeatures({})).toEqual([])
    expect(parseGeocodeFeatures(null)).toEqual([])
    expect(parseGeocodeFeatures({ features: 'nope' })).toEqual([])
  })
})

describe('parseReverseGeocodeAddress', () => {
  test('returns the full address of the first feature', () => {
    const address = parseReverseGeocodeAddress({ features: [addressFeature] }, 14.676, 121.0437)

    expect(address).toBe('123 Katipunan Avenue, Quezon City, Metro Manila, Philippines')
  })

  test('falls back to readable coordinates when the payload has no features', () => {
    const address = parseReverseGeocodeAddress({ features: [] }, 14.676, 121.0437)

    expect(address).toBe('Lat: 14.676000, Lng: 121.043700')
  })
})

describe('formatCoordinateFallback', () => {
  test('renders coordinates to six decimal places', () => {
    expect(formatCoordinateFallback(14.676, 121.0437)).toBe('Lat: 14.676000, Lng: 121.043700')
  })
})

describe('reverseGeocodeAddress', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('resolves the address of the matched feature', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [addressFeature] }),
    }) as unknown as typeof fetch

    await expect(reverseGeocodeAddress(14.676, 121.0437, TOKEN)).resolves.toBe(
      '123 Katipunan Avenue, Quezon City, Metro Manila, Philippines'
    )
  })

  test('falls back to readable coordinates when the request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    await expect(reverseGeocodeAddress(14.676, 121.0437, TOKEN)).resolves.toBe(
      'Lat: 14.676000, Lng: 121.043700'
    )
  })

  test('falls back to readable coordinates when no token is configured', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(reverseGeocodeAddress(14.676, 121.0437, '')).resolves.toBe(
      'Lat: 14.676000, Lng: 121.043700'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
