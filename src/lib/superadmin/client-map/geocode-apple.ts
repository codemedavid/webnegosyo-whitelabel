/**
 * Forward geocoding for the superadmin Client Map on the Apple Maps Server API.
 *
 * Apple has no batch endpoint, so addresses go a few at a time. The same
 * trust rule as the Mapbox path applies (`isTrustworthyMatch`): a match is
 * kept only when the town it landed in is named in the typed address, which
 * also drops province-level answers that name no town at all.
 *
 * Throws on any failure: the caller caches successes only.
 */

import type { LngLat } from '@/lib/geocoding/mapbox-feature'
import type { AppleMapsClient, ServerPlace } from '@/lib/maps/apple/maps-server-api'
import { isTrustworthyMatch, type GeocodeHit } from './geocode'

/** Parallel lookups per wave: quick for ~150 stores, gentle on the shared quota. */
const LOOKUP_CONCURRENCY = 5

function toHit(place: ServerPlace): GeocodeHit {
  return {
    point: [place.coordinates.lng, place.coordinates.lat],
    // No town means Apple only matched a province or the country.
    featureType: place.towns.length > 0 ? 'address' : 'region',
    contextNames: place.towns,
  }
}

async function lookup(address: string, client: Pick<AppleMapsClient, 'geocode'>): Promise<[string, LngLat] | null> {
  const [first] = await client.geocode(address)
  if (!first) return null
  const hit = toHit(first)
  return isTrustworthyMatch(address, hit) ? [address, hit.point] : null
}

export async function geocodeAddressesWithApple(
  addresses: string[],
  client: Pick<AppleMapsClient, 'geocode'>,
): Promise<Record<string, LngLat>> {
  const waves = Array.from({ length: Math.ceil(addresses.length / LOOKUP_CONCURRENCY) }, (_, index) =>
    addresses.slice(index * LOOKUP_CONCURRENCY, (index + 1) * LOOKUP_CONCURRENCY),
  )

  const matches: Array<[string, LngLat]> = []
  for (const wave of waves) {
    const results = await Promise.all(wave.map((address) => lookup(address, client)))
    matches.push(...results.filter((match): match is [string, LngLat] => match !== null))
  }
  return Object.fromEntries(matches)
}
