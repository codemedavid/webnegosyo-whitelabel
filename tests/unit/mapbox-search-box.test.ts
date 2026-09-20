import {
  buildSuggestUrl,
  buildRetrieveUrl,
  parseSuggestions,
  parseRetrievedCoordinates,
  createSessionToken,
  suggestAddresses,
  retrieveSuggestionCoordinates,
} from '@/lib/geocoding/mapbox-search-box'

const TOKEN = 'pk.test-token'
const SESSION = '4f0e5a3c-0000-4000-8000-000000000000'

const poiSuggestion = {
  name: 'SM North EDSA',
  mapbox_id: 'dXJuOm1ieHBvaTpTTU5PUlRI',
  feature_type: 'poi',
  place_formatted: 'Quezon City, Philippines',
  full_address: 'North Avenue, Quezon City, 1105, Philippines',
}

describe('buildSuggestUrl', () => {
  test('targets the Search Box suggest endpoint with query, token and session', () => {
    // Arrange / Act
    const url = new URL(buildSuggestUrl('sm north', TOKEN, SESSION))

    // Assert
    expect(url.origin + url.pathname).toBe('https://api.mapbox.com/search/searchbox/v1/suggest')
    expect(url.searchParams.get('q')).toBe('sm north')
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
    expect(url.searchParams.get('session_token')).toBe(SESSION)
  })

  test('restricts results to the Philippines and caps the suggestion count', () => {
    const url = new URL(buildSuggestUrl('sm north', TOKEN, SESSION, { limit: 99 }))

    expect(url.searchParams.get('country')).toBe('ph')
    expect(url.searchParams.get('limit')).toBe('10')
  })

  test('biases results toward the given proximity as lng,lat', () => {
    const url = new URL(
      buildSuggestUrl('sm north', TOKEN, SESSION, { proximity: { lat: 14.676, lng: 121.0437 } })
    )

    expect(url.searchParams.get('proximity')).toBe('121.0437,14.676')
  })

  test('omits proximity when no bias is supplied', () => {
    const url = new URL(buildSuggestUrl('sm north', TOKEN, SESSION))

    expect(url.searchParams.get('proximity')).toBeNull()
  })
})

describe('buildRetrieveUrl', () => {
  test('addresses the suggestion by its mapbox id and reuses the same session', () => {
    const url = new URL(buildRetrieveUrl(poiSuggestion.mapbox_id, TOKEN, SESSION))

    expect(url.origin + url.pathname).toBe(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${poiSuggestion.mapbox_id}`
    )
    expect(url.searchParams.get('access_token')).toBe(TOKEN)
    expect(url.searchParams.get('session_token')).toBe(SESSION)
  })

  test('escapes a mapbox id containing URL-significant characters', () => {
    const url = new URL(buildRetrieveUrl('abc/def?x=1', TOKEN, SESSION))

    expect(url.pathname).toBe('/search/searchbox/v1/retrieve/abc%2Fdef%3Fx%3D1')
  })
})

describe('parseSuggestions', () => {
  test('keeps the landmark name and appends its street context', () => {
    const results = parseSuggestions({ suggestions: [poiSuggestion] })

    expect(results).toEqual([
      {
        place_name: 'SM North EDSA, North Avenue, Quezon City, 1105, Philippines',
        mapbox_id: poiSuggestion.mapbox_id,
      },
    ])
  })

  test('does not repeat the name when the full address already begins with it', () => {
    const address = {
      name: '123 Katipunan Avenue',
      mapbox_id: 'addr-1',
      full_address: '123 Katipunan Avenue, Quezon City, Metro Manila, Philippines',
      place_formatted: 'Quezon City, Metro Manila, Philippines',
    }

    const results = parseSuggestions({ suggestions: [address] })

    expect(results[0].place_name).toBe('123 Katipunan Avenue, Quezon City, Metro Manila, Philippines')
  })

  test('falls back to the place context when no full address is available', () => {
    const suggestion = { name: 'Rizal Park', mapbox_id: 'poi-2', place_formatted: 'Manila, Philippines' }

    const results = parseSuggestions({ suggestions: [suggestion] })

    expect(results[0].place_name).toBe('Rizal Park, Manila, Philippines')
  })

  test('falls back to the bare name when no context is available', () => {
    const results = parseSuggestions({ suggestions: [{ name: 'Rizal Park', mapbox_id: 'poi-3' }] })

    expect(results[0].place_name).toBe('Rizal Park')
  })

  test('drops suggestions that cannot be retrieved or labelled', () => {
    const noId = { name: 'Nowhere' }
    const noName = { mapbox_id: 'poi-4' }

    expect(parseSuggestions({ suggestions: [noId, noName, poiSuggestion] })).toHaveLength(1)
  })

  test('returns an empty array for an empty, malformed or missing payload', () => {
    expect(parseSuggestions({ suggestions: [] })).toEqual([])
    expect(parseSuggestions({})).toEqual([])
    expect(parseSuggestions(null)).toEqual([])
    expect(parseSuggestions({ suggestions: 'nope' })).toEqual([])
  })
})

describe('parseRetrievedCoordinates', () => {
  test('reads [lng, lat] from the retrieved feature geometry', () => {
    const payload = {
      features: [
        {
          geometry: { type: 'Point', coordinates: [121.0303751, 14.6568239] },
          properties: { coordinates: { longitude: 121.0303751, latitude: 14.6568239 } },
        },
      ],
    }

    expect(parseRetrievedCoordinates(payload)).toEqual([121.0303751, 14.6568239])
  })

  test('falls back to the coordinates property when geometry is absent', () => {
    const payload = {
      features: [{ properties: { coordinates: { longitude: 120.9842, latitude: 14.5995 } } }],
    }

    expect(parseRetrievedCoordinates(payload)).toEqual([120.9842, 14.5995])
  })

  test('returns null when the payload carries no usable coordinates', () => {
    expect(parseRetrievedCoordinates({ features: [] })).toBeNull()
    expect(parseRetrievedCoordinates({ features: [{ properties: {} }] })).toBeNull()
    expect(parseRetrievedCoordinates(null)).toBeNull()
  })
})

describe('createSessionToken', () => {
  test('returns a distinct non-empty token on each call', () => {
    const first = createSessionToken()
    const second = createSessionToken()

    expect(first).toEqual(expect.any(String))
    expect(first.length).toBeGreaterThan(0)
    expect(first).not.toBe(second)
  })
})

describe('suggestAddresses', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('resolves parsed suggestions from a successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [poiSuggestion] }),
    }) as unknown as typeof fetch

    const results = await suggestAddresses('sm north', TOKEN, SESSION)

    expect(results).toHaveLength(1)
    expect(results[0].mapbox_id).toBe(poiSuggestion.mapbox_id)
  })

  test('returns no suggestions without calling Mapbox when the query is blank', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(suggestAddresses('   ', TOKEN, SESSION)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns no suggestions without calling Mapbox when the token is missing', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(suggestAddresses('sm north', '', SESSION)).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns no suggestions when Mapbox rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Not Authorized' }),
    }) as unknown as typeof fetch

    await expect(suggestAddresses('sm north', TOKEN, SESSION)).resolves.toEqual([])
  })

  test('returns no suggestions when the network call fails outright', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    await expect(suggestAddresses('sm north', TOKEN, SESSION)).resolves.toEqual([])
  })
})

describe('retrieveSuggestionCoordinates', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('resolves the coordinates of the retrieved suggestion', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [121.0303751, 14.6568239] } }],
      }),
    }) as unknown as typeof fetch

    await expect(retrieveSuggestionCoordinates('poi-1', TOKEN, SESSION)).resolves.toEqual([
      121.0303751, 14.6568239,
    ])
  })

  test('resolves null instead of throwing when the retrieve call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch

    await expect(retrieveSuggestionCoordinates('poi-1', TOKEN, SESSION)).resolves.toBeNull()
  })

  test('resolves null without calling Mapbox when the token is missing', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(retrieveSuggestionCoordinates('poi-1', '', SESSION)).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
