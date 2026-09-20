/**
 * Mapbox Geocoding API (v6) client — reverse geocoding only.
 *
 * Replaces the public Nominatim/OpenStreetMap endpoints previously called from the
 * address picker. Nominatim's usage policy forbids autocomplete-style querying and
 * caps traffic at 1 req/sec.
 *
 * Forward search deliberately does *not* live here: this API indexes addresses and
 * streets but not points of interest, so landmark queries resolve badly. Typeahead
 * goes through the Search Box API instead (see `./mapbox-search-box`).
 *
 * This uses the *temporary* geocoding SKU (`permanent` is never set), which is free
 * for the first 100,000 requests per month on the same access token the map canvas
 * already uses.
 */

import {
  asNonEmptyString,
  composePlaceLabel,
  extractFeatureCoordinates,
  type LngLat,
  type MapboxFeature,
} from './mapbox-feature'

export interface GeocodeResult {
  place_name: string
  coordinates: LngLat
}

const GEOCODE_BASE_URL = 'https://api.mapbox.com/search/geocode/v6'
const COORDINATE_FALLBACK_PRECISION = 6

export function formatCoordinateFallback(lat: number, lng: number): string {
  return `Lat: ${lat.toFixed(COORDINATE_FALLBACK_PRECISION)}, Lng: ${lng.toFixed(COORDINATE_FALLBACK_PRECISION)}`
}

export function buildReverseGeocodeUrl(lat: number, lng: number, accessToken: string): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    access_token: accessToken,
    limit: '1',
  })

  return `${GEOCODE_BASE_URL}/reverse?${params.toString()}`
}

/**
 * v6 returns `full_address` for addresses, but POIs and administrative places often
 * carry only `name` plus `place_formatted`, so compose a label from whatever is present.
 */
function extractPlaceName(feature: MapboxFeature): string | null {
  const properties = feature.properties ?? {}
  const context =
    asNonEmptyString(properties.full_address) ?? asNonEmptyString(properties.place_formatted)
  return composePlaceLabel(asNonEmptyString(properties.name), context)
}

export function parseGeocodeFeatures(payload: unknown): GeocodeResult[] {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features)) return []

  return features.reduce<GeocodeResult[]>((results, feature: MapboxFeature) => {
    const placeName = extractPlaceName(feature)
    const coordinates = extractFeatureCoordinates(feature)
    if (!placeName || !coordinates) return results
    return [...results, { place_name: placeName, coordinates }]
  }, [])
}

export function parseReverseGeocodeAddress(payload: unknown, lat: number, lng: number): string {
  const [first] = parseGeocodeFeatures(payload)
  return first?.place_name ?? formatCoordinateFallback(lat, lng)
}

async function fetchGeocodeJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Mapbox geocoding failed with status ${response.status}`)
  }
  return response.json()
}

/**
 * Never throws: falls back to readable coordinates so a dropped pin still yields
 * something the merchant can act on.
 */
export async function reverseGeocodeAddress(
  lat: number,
  lng: number,
  accessToken: string
): Promise<string> {
  if (!accessToken) return formatCoordinateFallback(lat, lng)

  try {
    const payload = await fetchGeocodeJson(buildReverseGeocodeUrl(lat, lng, accessToken))
    return parseReverseGeocodeAddress(payload, lat, lng)
  } catch (error) {
    console.error('Mapbox reverse geocoding error:', error)
    return formatCoordinateFallback(lat, lng)
  }
}
