/**
 * Mapbox Search Box API client — used for address typeahead.
 *
 * The Geocoding API indexes addresses and streets but *not* points of interest, so
 * Philippine landmark queries resolve badly there ("SM North EDSA" returns EDSA itself,
 * "One Rockwell Makati" returns a barangay in Rizal). The Search Box API is the
 * POI-indexed one and returns the place customers actually mean.
 *
 * Billing is per *session*, not per keystroke: every `suggest` call sharing a session
 * token is free, and the session is charged once. 2,500 sessions/month are free. Callers
 * must therefore hold one session token across a search interaction and mint a new one
 * after each `retrieve`.
 */

import {
  asNonEmptyString,
  composePlaceLabel,
  extractFeatureCoordinates,
  type LngLat,
  type MapboxFeature,
} from './mapbox-feature'

export interface SearchBoxSuggestion {
  place_name: string
  /** Opaque Mapbox handle; `suggest` returns no coordinates, they need a `retrieve`. */
  mapbox_id: string
}

export interface SuggestOptions {
  /** Bias results toward this point. The single biggest accuracy lever for local search. */
  proximity?: { lat: number; lng: number }
  limit?: number
  country?: string
}

const SEARCH_BOX_BASE_URL = 'https://api.mapbox.com/search/searchbox/v1'
const DEFAULT_COUNTRY = 'ph'
const DEFAULT_LANGUAGE = 'en'
const DEFAULT_LIMIT = 10
const SEARCH_BOX_MAX_LIMIT = 10
const FALLBACK_TOKEN_RADIX = 36

/**
 * A session token groups the keystrokes of one search into a single billable unit.
 * Mapbox only requires it to be unique per search, not a strict UUID.
 */
export function createSessionToken(): string {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  return `${Date.now().toString(FALLBACK_TOKEN_RADIX)}-${Math.random().toString(FALLBACK_TOKEN_RADIX).slice(2)}`
}

export function buildSuggestUrl(
  query: string,
  accessToken: string,
  sessionToken: string,
  options: SuggestOptions = {}
): string {
  const { proximity, limit = DEFAULT_LIMIT, country = DEFAULT_COUNTRY } = options
  const params = new URLSearchParams({
    q: query,
    access_token: accessToken,
    session_token: sessionToken,
    country,
    language: DEFAULT_LANGUAGE,
    limit: String(Math.min(limit, SEARCH_BOX_MAX_LIMIT)),
  })

  if (proximity) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`)
  }

  return `${SEARCH_BOX_BASE_URL}/suggest?${params.toString()}`
}

export function buildRetrieveUrl(
  mapboxId: string,
  accessToken: string,
  sessionToken: string
): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    session_token: sessionToken,
  })

  return `${SEARCH_BOX_BASE_URL}/retrieve/${encodeURIComponent(mapboxId)}?${params.toString()}`
}

interface RawSuggestion {
  name?: unknown
  mapbox_id?: unknown
  full_address?: unknown
  place_formatted?: unknown
}

export function parseSuggestions(payload: unknown): SearchBoxSuggestion[] {
  const suggestions = (payload as { suggestions?: unknown })?.suggestions
  if (!Array.isArray(suggestions)) return []

  return suggestions.reduce<SearchBoxSuggestion[]>((results, suggestion: RawSuggestion) => {
    const mapboxId = asNonEmptyString(suggestion?.mapbox_id)
    const name = asNonEmptyString(suggestion?.name)
    const context =
      asNonEmptyString(suggestion?.full_address) ?? asNonEmptyString(suggestion?.place_formatted)
    const placeName = composePlaceLabel(name, context)

    if (!mapboxId || !placeName) return results
    return [...results, { place_name: placeName, mapbox_id: mapboxId }]
  }, [])
}

export function parseRetrievedCoordinates(payload: unknown): LngLat | null {
  const features = (payload as { features?: unknown })?.features
  if (!Array.isArray(features)) return null

  const [first] = features as MapboxFeature[]
  return first ? extractFeatureCoordinates(first) : null
}

async function fetchSearchBoxJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Mapbox Search Box request failed with status ${response.status}`)
  }
  return response.json()
}

/**
 * Never throws: address search is an optional assist, so a failure degrades to
 * "no suggestions" and leaves whatever the customer typed intact.
 */
export async function suggestAddresses(
  query: string,
  accessToken: string,
  sessionToken: string,
  options: SuggestOptions = {}
): Promise<SearchBoxSuggestion[]> {
  if (!query.trim() || !accessToken) return []

  try {
    const payload = await fetchSearchBoxJson(
      buildSuggestUrl(query.trim(), accessToken, sessionToken, options)
    )
    return parseSuggestions(payload)
  } catch (error) {
    console.error('Mapbox address suggestion error:', error)
    return []
  }
}

/**
 * Never throws: resolves null so the caller can keep the typed address and simply
 * leave the map pin where it is.
 */
export async function retrieveSuggestionCoordinates(
  mapboxId: string,
  accessToken: string,
  sessionToken: string
): Promise<LngLat | null> {
  if (!mapboxId || !accessToken) return null

  try {
    const payload = await fetchSearchBoxJson(buildRetrieveUrl(mapboxId, accessToken, sessionToken))
    return parseRetrievedCoordinates(payload)
  } catch (error) {
    console.error('Mapbox suggestion retrieve error:', error)
    return null
  }
}
