/**
 * Shared parsing helpers for Mapbox search responses.
 *
 * The Geocoding API and the Search Box API return different envelopes but the same
 * feature shape, so coordinate extraction and the value guards live here rather than
 * being duplicated in each client.
 */

export interface MapboxFeature {
  geometry?: { coordinates?: unknown }
  properties?: {
    name?: unknown
    full_address?: unknown
    place_formatted?: unknown
    coordinates?: { longitude?: unknown; latitude?: unknown }
  }
}

/** [lng, lat] — the order used by the mapbox-gl marker and camera APIs. */
export type LngLat = [number, number]

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/**
 * Prefers the structured `properties.coordinates` object, which carries the precise
 * point, and falls back to the GeoJSON geometry when it is absent.
 */
export function extractFeatureCoordinates(feature: MapboxFeature): LngLat | null {
  const point = feature.properties?.coordinates
  const lng = asFiniteNumber(point?.longitude)
  const lat = asFiniteNumber(point?.latitude)
  if (lng !== null && lat !== null) return [lng, lat]

  const geometry = feature.geometry?.coordinates
  if (Array.isArray(geometry)) {
    const geometryLng = asFiniteNumber(geometry[0])
    const geometryLat = asFiniteNumber(geometry[1])
    if (geometryLng !== null && geometryLat !== null) return [geometryLng, geometryLat]
  }

  return null
}

/**
 * Composes a human-readable label from a Mapbox result.
 *
 * POIs carry a `name` ("SM North EDSA") separately from their street address, so the
 * name is prepended to keep the landmark the customer recognised. Address results
 * already lead with their name inside `full_address`, so it is used as-is.
 */
export function composePlaceLabel(name: string | null, context: string | null): string | null {
  if (!name) return context
  if (!context) return name
  return context.startsWith(name) ? context : `${name}, ${context}`
}
