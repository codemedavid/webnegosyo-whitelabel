/**
 * Does a store's pin sit where its typed address says it is?
 *
 * The 2026-10 audit found a store pinned about 550 km from its own address.
 * The pin is the Lalamove pickup and the origin of every delivery fee, so a
 * save that moves them apart is worth one question. Only a street-level
 * geocode counts: "Lucena" names a city, not a door, and must not raise a
 * false alarm.
 */

import { haversineDistanceKm, type LatLng } from '@/lib/delivery-fee'

/** Past this, the pin and the address describe different places. */
export const STORE_PIN_ADDRESS_MISMATCH_KM = 2

export interface GeocodedPlace {
  coordinates: LatLng
  isStreetLevel: boolean
}

/** Km between the pin and the address's first street-level match, when past the threshold; else null. */
export function storePinAddressMismatchKm(pin: LatLng | null, places: readonly GeocodedPlace[]): number | null {
  if (!pin) return null
  const match = places.find((place) => place.isStreetLevel)
  if (!match) return null
  const km = haversineDistanceKm(pin.lat, pin.lng, match.coordinates.lat, match.coordinates.lng)
  return km > STORE_PIN_ADDRESS_MISMATCH_KM ? km : null
}
