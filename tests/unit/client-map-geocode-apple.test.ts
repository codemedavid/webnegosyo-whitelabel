/**
 * @jest-environment node
 */
import type { ServerPlace } from '@/lib/maps/apple/maps-server-api'

jest.mock('server-only', () => ({}))

function place(lat: number, lng: number, towns: string[]): ServerPlace {
  return { name: null, address: towns.join(', '), coordinates: { lat, lng }, countryCode: 'PH', towns }
}

async function load() {
  return import('@/lib/superadmin/client-map/geocode-apple')
}

describe('geocodeAddressesWithApple', () => {
  it('keeps a match only when its town is named in the address', async () => {
    // Arrange
    const { geocodeAddressesWithApple } = await load()
    const answers: Record<string, ServerPlace[]> = {
      'Rizal St, Batac, Ilocos Norte': [place(10.3, 123.9, ['Consolacion'])],
      'Brgy. Sampaga, Balayan, Batangas': [place(13.94, 120.73, ['Balayán', 'Sampaga'])],
      'Somewhere unknown': [],
    }
    const client = { geocode: jest.fn(async (q: string) => answers[q] ?? []), reverseGeocode: jest.fn(), search: jest.fn() }

    // Act
    const result = await geocodeAddressesWithApple(Object.keys(answers), client)

    // Assert
    expect(result).toEqual({ 'Brgy. Sampaga, Balayan, Batangas': [120.73, 13.94] })
    expect(client.geocode).toHaveBeenCalledTimes(3)
  })

  it('rejects a province-level match that names no town', async () => {
    const { geocodeAddressesWithApple } = await load()
    const client = { geocode: jest.fn(async () => [place(12, 122, [])]), reverseGeocode: jest.fn(), search: jest.fn() }

    await expect(geocodeAddressesWithApple(['Aklan'], client)).resolves.toEqual({})
  })

  it('throws when any lookup fails, so a partial result is never cached', async () => {
    const { geocodeAddressesWithApple } = await load()
    const client = {
      geocode: jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Apple Maps geocode failed with status 429')),
      reverseGeocode: jest.fn(),
      search: jest.fn(),
    }

    await expect(geocodeAddressesWithApple(['a', 'b'], client)).rejects.toThrow('status 429')
  })
})
