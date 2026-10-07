/**
 * Apple Maps Server API (https://maps-api.apple.com/v1) for server-side
 * geocoding, reverse geocoding and search. Server only.
 *
 * Auth is two-step: our ES256 JWT (no origin claim) is exchanged at /v1/token
 * for a 30-minute access token, which this client caches until shortly before
 * it expires. Every call counts against the team's daily service-call quota,
 * shared with MapKit JS, so callers cache results.
 */

import 'server-only'
import type { LatLng } from './mapkit-address'
import { signMapKitToken, type MapKitConfig } from './mapkit-token'

const API_BASE = 'https://maps-api.apple.com/v1'
const JWT_TTL_SECONDS = 10 * 60
/** Refresh this long before Apple's expiry so an in-flight call never carries a stale token. */
const ACCESS_TOKEN_SAFETY_MS = 60_000
const REQUEST_TIMEOUT_MS = 10_000
const COUNTRIES = 'PH'
const LANGUAGE = 'en-US'

export interface ServerPlace {
  name: string | null
  /** Apple's formatted address lines, joined: the exact address. */
  address: string
  coordinates: LatLng
  countryCode: string | null
  /** Town-level names the place sits in (locality, sub-locality, barangays). */
  towns: string[]
}

export type FetchLike = (
  url: string,
  init: { method?: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

interface RawPlace {
  name?: unknown
  coordinate?: { latitude?: unknown; longitude?: unknown }
  formattedAddressLines?: unknown
  structuredAddress?: { locality?: unknown; subLocality?: unknown; dependentLocalities?: unknown }
  countryCode?: unknown
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Each entry may itself hold several lines separated by newlines. */
function texts(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .flatMap((value) => (typeof value === 'string' ? value.split(/\n+/) : []))
    .map(text)
    .filter((value): value is string => value !== null)
}

function toServerPlace(raw: RawPlace): ServerPlace | null {
  const lat = Number(raw.coordinate?.latitude)
  const lng = Number(raw.coordinate?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const address = texts(raw.formattedAddressLines).join(', ')
  const name = text(raw.name)
  const structured = raw.structuredAddress ?? {}
  const towns = [text(structured.locality), text(structured.subLocality), ...texts(structured.dependentLocalities)]
    .filter((town): town is string => town !== null)
  return {
    name,
    address: address || name || '',
    coordinates: { lat, lng },
    countryCode: text(raw.countryCode),
    towns: [...new Set(towns)],
  }
}

export function parseServerPlaces(payload: unknown): ServerPlace[] {
  const results = (payload as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) return []
  return results
    .map((raw) => toServerPlace((raw ?? {}) as RawPlace))
    .filter((place): place is ServerPlace => place !== null)
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined
}

function point(at: LatLng): string {
  return `${at.lat},${at.lng}`
}

export interface AppleMapsClient {
  geocode(query: string): Promise<ServerPlace[]>
  reverseGeocode(at: LatLng): Promise<ServerPlace[]>
  search(query: string, near?: LatLng): Promise<ServerPlace[]>
}

export function createAppleMapsClient(
  config: MapKitConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): AppleMapsClient {
  let cached: { token: string; refreshAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (cached && Date.now() < cached.refreshAt) return cached.token
    const response = await fetchImpl(`${API_BASE}/token`, {
      headers: { Authorization: `Bearer ${signMapKitToken(config, { ttlSeconds: JWT_TTL_SECONDS })}` },
      signal: timeoutSignal(),
    })
    if (!response.ok) throw new Error(`Apple Maps token exchange failed with status ${response.status}`)
    const body = (await response.json()) as { accessToken?: unknown; expiresInSeconds?: unknown }
    const token = text(body.accessToken)
    if (!token) throw new Error('Apple Maps token exchange returned no access token')
    const lifetimeMs = Number(body.expiresInSeconds) * 1000 || JWT_TTL_SECONDS * 1000
    cached = { token, refreshAt: Date.now() + lifetimeMs - ACCESS_TOKEN_SAFETY_MS }
    return token
  }

  async function get(path: string, params: Record<string, string>): Promise<ServerPlace[]> {
    const url = `${API_BASE}/${path}?${new URLSearchParams(params).toString()}`
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${await accessToken()}` },
      signal: timeoutSignal(),
    })
    if (!response.ok) throw new Error(`Apple Maps ${path} failed with status ${response.status}`)
    return parseServerPlaces(await response.json())
  }

  return {
    geocode: (query) => get('geocode', { q: query, limitToCountries: COUNTRIES, lang: LANGUAGE }),
    reverseGeocode: (at) => get('reverseGeocode', { loc: point(at), lang: LANGUAGE }),
    search: (query, near) =>
      get('search', {
        q: query,
        limitToCountries: COUNTRIES,
        lang: LANGUAGE,
        resultTypeFilter: 'Address,Poi',
        ...(near ? { searchLocation: point(near) } : {}),
      }),
  }
}
