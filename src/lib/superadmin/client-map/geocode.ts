/**
 * Forward geocoding for the superadmin Client Map — Mapbox Geocoding v6 *batch*.
 *
 * One POST resolves every address (up to 1,000 per request), on the temporary SKU
 * (`permanent` is never set; 100k free/month). It does NOT index POIs (see
 * `src/lib/geocoding/mapbox-geocoding.ts`), and it will happily match a "Rizal St."
 * in the wrong town. So a match is only kept when its town/city appears in the
 * typed address; anything else is retried at town level, and dropped if the
 * retry is no better. Measured 2026-09-24: 8 of 131 first-pass matches were in a
 * town the address never mentioned (e.g. "…, Batac" → Consolacion, Cebu).
 *
 * Throws on any failure: the caller caches successes only.
 */

import {
  asNonEmptyString,
  extractFeatureCoordinates,
  type LngLat,
  type MapboxFeature,
} from '@/lib/geocoding/mapbox-feature'

const BATCH_URL = 'https://api.mapbox.com/search/geocode/v6/batch'
const MAX_QUERIES_PER_BATCH = 1000
const GEOCODE_TIMEOUT_MS = 10_000
const TOWN_LEVEL_TYPES = 'locality,place,district'
/** Too coarse to pin a store: the centre of a province or of the country. */
const VAGUE_FEATURE_TYPES = new Set(['region', 'country'])

export interface GeocodeHit {
  point: LngLat
  featureType: string
  /** Town-level names the match sits in (place, locality, district). */
  contextNames: string[]
}

interface BatchQuery {
  q: string
  country: 'ph'
  limit: 1
  autocomplete: false
  types?: string
}

interface GeocodeProperties {
  feature_type?: unknown
  name?: unknown
  context?: Record<string, { name?: unknown } | undefined>
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function buildBatchGeocodeBody(addresses: string[], types?: string): BatchQuery[] {
  return addresses.map((q) => ({ q, country: 'ph', limit: 1, autocomplete: false, ...(types ? { types } : {}) }))
}

function toHit(feature: MapboxFeature): GeocodeHit | null {
  const point = extractFeatureCoordinates(feature)
  if (!point) return null
  const props = (feature.properties ?? {}) as GeocodeProperties
  const featureType = asNonEmptyString(props.feature_type) ?? 'unknown'
  const context = props.context ?? {}
  const ownName = featureType === 'place' || featureType === 'locality' ? props.name : null
  const names = [context.place?.name, context.locality?.name, context.district?.name, ownName]
    .map(asNonEmptyString)
    .filter((name): name is string => name !== null)
  return { point, featureType, contextNames: [...new Set(names)] }
}

/** Batch results come back in request order; each maps to its address by index. */
export function parseBatchGeocode(addresses: string[], payload: unknown): Record<string, GeocodeHit> {
  const batch = (payload as { batch?: unknown } | null)?.batch
  if (!Array.isArray(batch)) return {}

  return addresses.reduce<Record<string, GeocodeHit>>((acc, address, index) => {
    const features = (batch[index] as { features?: unknown } | undefined)?.features
    const first = Array.isArray(features) ? (features[0] as MapboxFeature | undefined) : undefined
    const hit = first ? toHit(first) : null
    return hit ? { ...acc, [address]: hit } : acc
  }, {})
}

/** Lowercase, accent-free, punctuation-free, without "City"/"City of" — for name matching. */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bcity of\b|\bcity\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A match is trusted only when the town/city it landed in is named in the address. */
export function isTrustworthyMatch(address: string, hit: GeocodeHit): boolean {
  if (VAGUE_FEATURE_TYPES.has(hit.featureType)) return false
  const haystack = ` ${normalizeName(address)} `
  return hit.contextNames.some((name) => {
    const needle = normalizeName(name)
    return needle.length > 0 && haystack.includes(` ${needle} `)
  })
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )
}

async function geocodeChunk(
  addresses: string[],
  accessToken: string,
  fetchImpl: FetchLike,
  types?: string,
): Promise<Record<string, GeocodeHit>> {
  const url = `${BATCH_URL}?${new URLSearchParams({ access_token: accessToken }).toString()}`
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBatchGeocodeBody(addresses, types)),
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(GEOCODE_TIMEOUT_MS) : undefined,
  })
  if (!response.ok) {
    throw new Error(`Mapbox batch geocoding failed with status ${response.status}`)
  }
  return parseBatchGeocode(addresses, await response.json())
}

async function geocodeAll(
  addresses: string[],
  accessToken: string,
  fetchImpl: FetchLike,
  types?: string,
): Promise<Record<string, GeocodeHit>> {
  if (addresses.length === 0) return {}
  const results = await Promise.all(
    chunk(addresses, MAX_QUERIES_PER_BATCH).map((part) => geocodeChunk(part, accessToken, fetchImpl, types)),
  )
  return Object.assign({}, ...results)
}

function trustedPoints(addresses: string[], hits: Record<string, GeocodeHit>): Record<string, LngLat> {
  return addresses.reduce<Record<string, LngLat>>((acc, address) => {
    const hit = hits[address]
    return hit && isTrustworthyMatch(address, hit) ? { ...acc, [address]: hit.point } : acc
  }, {})
}

export async function batchGeocodeAddresses(
  addresses: string[],
  accessToken: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<Record<string, LngLat>> {
  if (addresses.length === 0) return {}
  if (!accessToken) throw new Error('Mapbox access token is not configured')

  const firstPass = trustedPoints(addresses, await geocodeAll(addresses, accessToken, fetchImpl))
  const retry = addresses.filter((address) => !(address in firstPass))
  const secondPass = trustedPoints(retry, await geocodeAll(retry, accessToken, fetchImpl, TOWN_LEVEL_TYPES))
  return { ...firstPass, ...secondPass }
}
