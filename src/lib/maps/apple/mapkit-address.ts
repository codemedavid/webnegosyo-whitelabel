/**
 * Pure shaping of MapKit JS results into what the address fields store: one
 * address line plus `{ lat, lng }`. No MapKit runtime needed, so it is tested
 * in isolation.
 */

import { formatCoordinateFallback } from '@/lib/geocoding/mapbox-geocoding'
import type { MapKitAutocompleteResult, MapKitPlace } from './mapkit-types'

export interface LatLng {
  lat: number
  lng: number
}

export interface AddressSelection {
  address: string
  coordinates: LatLng
}

const COORDINATE_FALLBACK_PATTERN = /Lat:\s*(-?[\d.]+),\s*Lng:\s*(-?[\d.]+)/

/** Apple may pack several address lines into one string, separated by newlines. */
function clean(value: string | undefined): string | null {
  const trimmed = value
    ?.split(/\s*\n\s*/)
    .filter(Boolean)
    .join(', ')
    .trim()
  return trimmed ? trimmed : null
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function addressFromParts(place: MapKitPlace): string | null {
  const parts = [place.fullThoroughfare, place.subLocality, place.locality, place.administrativeArea, place.country]
    .map(clean)
    .filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * The one line a rider reads: "<place name>, <street address>" for a point of
 * interest, the street address alone otherwise.
 */
export function formatPlaceAddress(place: MapKitPlace): string {
  const address = clean(place.formattedAddress) ?? addressFromParts(place)
  const name = clean(place.name)
  if (!address) return name ?? formatCoordinateFallback(place.coordinate.latitude, place.coordinate.longitude)
  if (!name || address.toLowerCase().startsWith(name.toLowerCase())) return address
  return `${name}, ${address}`
}

export function placeToSelection(place: MapKitPlace): AddressSelection | null {
  const { latitude: lat, longitude: lng } = place.coordinate ?? {}
  if (!isValidLatLng(lat, lng)) return null
  return { address: formatPlaceAddress(place), coordinates: { lat, lng } }
}

export function autocompleteLabel(result: MapKitAutocompleteResult): string {
  return (result.displayLines ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ')
}

/** Coordinates written as a fallback address ("Lat: …, Lng: …"), if that is what this is. */
export function parseCoordinateFallback(value: string): LatLng | null {
  const match = value.match(COORDINATE_FALLBACK_PATTERN)
  if (!match) return null
  const lat = Number.parseFloat(match[1])
  const lng = Number.parseFloat(match[2])
  return isValidLatLng(lat, lng) ? { lat, lng } : null
}

/** A stored coordinate pair (numbers, or the strings form drafts hold) as LatLng, or null. */
export function parseLatLng(lat: number | string | null | undefined, lng: number | string | null | undefined): LatLng | null {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null
  const parsedLat = Number(lat)
  const parsedLng = Number(lng)
  return isValidLatLng(parsedLat, parsedLng) ? { lat: parsedLat, lng: parsedLng } : null
}
