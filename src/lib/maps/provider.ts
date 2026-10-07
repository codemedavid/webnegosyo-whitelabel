/**
 * Which map provider the web app uses. Apple Maps (MapKit JS) once
 * `NEXT_PUBLIC_MAPS_PROVIDER=apple` is set alongside the APPLE_MAPKIT_* keys;
 * Mapbox otherwise, so a deploy without Apple keys keeps working, and setting
 * the variable back to `mapbox` is the rollback.
 */

export type MapsProvider = 'apple' | 'mapbox'

export function getMapsProvider(value: string | undefined = process.env.NEXT_PUBLIC_MAPS_PROVIDER): MapsProvider {
  return value?.trim().toLowerCase() === 'apple' ? 'apple' : 'mapbox'
}
