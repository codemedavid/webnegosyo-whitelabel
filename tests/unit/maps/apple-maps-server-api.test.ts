/**
 * @jest-environment node
 */
import { generateKeyPairSync } from 'node:crypto'

jest.mock('server-only', () => ({}))

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const config = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
}

const makati = {
  name: 'Greenbelt 5',
  coordinate: { latitude: 14.5527, longitude: 121.0219 },
  formattedAddressLines: ['Legazpi St', 'Makati', '1223 Metro Manila', 'Philippines'],
  structuredAddress: { locality: 'Makati', subLocality: 'Legazpi Village', administrativeArea: 'Metro Manila', dependentLocalities: ['San Lorenzo'] },
  countryCode: 'PH',
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

async function load() {
  return import('@/lib/maps/apple/maps-server-api')
}

describe('parseServerPlaces', () => {
  it('splits address lines Apple packed with newlines', async () => {
    const { parseServerPlaces } = await load()
    const [place] = parseServerPlaces({
      results: [{ ...makati, formattedAddressLines: ['Seaside Blvd\nPasay City\n1308 Metro Manila', 'Philippines'] }],
    })
    expect(place.address).toBe('Seaside Blvd, Pasay City, 1308 Metro Manila, Philippines')
  })

  it('flattens Apple places into one address line with lat/lng and their towns', async () => {
    const { parseServerPlaces } = await load()
    expect(parseServerPlaces({ results: [makati, { name: 'no coordinate' }] })).toEqual([
      {
        name: 'Greenbelt 5',
        address: 'Legazpi St, Makati, 1223 Metro Manila, Philippines',
        coordinates: { lat: 14.5527, lng: 121.0219 },
        countryCode: 'PH',
        towns: ['Makati', 'Legazpi Village', 'San Lorenzo'],
      },
    ])
    expect(parseServerPlaces(null)).toEqual([])
  })
})

describe('createAppleMapsClient', () => {
  it('exchanges the signed JWT for an access token once, then reuses it', async () => {
    const { createAppleMapsClient } = await load()
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValue(json(200, { results: [makati] }))
    const client = createAppleMapsClient(config, fetchImpl)

    await client.geocode('Greenbelt 5, Makati')
    const places = await client.reverseGeocode({ lat: 14.5527, lng: 121.0219 })

    expect(places[0].address).toBe('Legazpi St, Makati, 1223 Metro Manila, Philippines')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0]
    expect(tokenUrl).toBe('https://maps-api.apple.com/v1/token')
    expect(tokenInit.headers.Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    const [geocodeUrl, geocodeInit] = fetchImpl.mock.calls[1]
    expect(geocodeUrl).toBe(
      'https://maps-api.apple.com/v1/geocode?q=Greenbelt+5%2C+Makati&limitToCountries=PH&lang=en-US',
    )
    expect(geocodeInit.headers.Authorization).toBe('Bearer access-1')
    expect(fetchImpl.mock.calls[2][0]).toBe('https://maps-api.apple.com/v1/reverseGeocode?loc=14.5527%2C121.0219&lang=en-US')
  })

  it('biases a search toward a point and asks for addresses and businesses', async () => {
    const { createAppleMapsClient } = await load()
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValue(json(200, { results: [] }))
    const client = createAppleMapsClient(config, fetchImpl)

    await client.search('jollibee', { lat: 14.5, lng: 121 })

    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://maps-api.apple.com/v1/search?q=jollibee&limitToCountries=PH&lang=en-US&resultTypeFilter=Address%2CPoi&searchLocation=14.5%2C121',
    )
  })

  it('throws with the status when Apple refuses, without echoing the token', async () => {
    const { createAppleMapsClient } = await load()
    const fetchImpl = jest.fn().mockResolvedValueOnce(json(401, { error: { message: 'Not Authorized' } }))
    const client = createAppleMapsClient(config, fetchImpl)

    await expect(client.geocode('Makati')).rejects.toThrow('Apple Maps token exchange failed with status 401')
  })
})

describe('driving distance (ETA)', () => {
  const store = { lat: 15.44454447, lng: 120.77120664 }
  const home = { lat: 15.4804001, lng: 120.77600268 }

  it('reads distanceMeters from the first ETA', async () => {
    const { parseEtaDistanceMeters } = await load()
    expect(parseEtaDistanceMeters({ etas: [{ transportType: 'Automobile', distanceMeters: 8160, expectedTravelTimeSeconds: 1126 }] })).toBe(8160)
  })

  it.each([{ etas: [] }, null, { etas: [{ distanceMeters: -1 }] }, { etas: [{ distanceMeters: 'far' }] }])(
    'finds no distance in %p',
    async (payload) => {
      const { parseEtaDistanceMeters } = await load()
      expect(parseEtaDistanceMeters(payload)).toBeNull()
    },
  )

  it('asks for a driving ETA from the store to the address', async () => {
    const { createAppleMapsClient } = await load()
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValue(json(200, { etas: [{ distanceMeters: 8160 }] }))
    const client = createAppleMapsClient(config, fetchImpl)

    await expect(client.drivingDistanceMeters(store, home)).resolves.toBe(8160)
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://maps-api.apple.com/v1/etas?origin=15.44454447%2C120.77120664&destinations=15.4804001%2C120.77600268&transportType=Automobile',
    )
  })

  it('throws when Apple finds no route, so another provider can try', async () => {
    const { createAppleMapsClient } = await load()
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json(200, { accessToken: 'access-1', expiresInSeconds: 1800 }))
      .mockResolvedValue(json(200, { etas: [] }))
    const client = createAppleMapsClient(config, fetchImpl)

    await expect(client.drivingDistanceMeters(store, home)).rejects.toThrow('no driving route')
  })
})
