'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatCoordinateFallback } from '@/lib/geocoding/mapbox-geocoding'
import {
  autocompleteLabel,
  formatPlaceAddress,
  placeToSelection,
  type AddressSelection,
  type LatLng,
} from '@/lib/maps/apple/mapkit-address'
import { isMapKitUnconfiguredError, loadMapKit } from '@/lib/maps/apple/mapkit-loader'
import type { MapKit, MapKitAutocompleteResult, MapKitGeocoder, MapKitSearch } from '@/lib/maps/apple/mapkit-types'

export type MapKitStatus = 'loading' | 'ready' | 'unconfigured' | 'failed'

export interface AddressSuggestion {
  key: string
  label: string
  result: MapKitAutocompleteResult
}

interface Services {
  mapkit: MapKit
  search: MapKitSearch
  geocoder: MapKitGeocoder
}

/** Search bias: about 50km around the point the diner is looking at. */
const SEARCH_SPAN_DEGREES = 0.5
const SEARCH_COUNTRIES = 'PH'
/** 4 decimals ≈ 11m: a nudge of the pin inside that reuses the last lookup. */
const CACHE_PRECISION = 4

function regionAround(mapkit: MapKit, near: LatLng) {
  return new mapkit.CoordinateRegion(
    new mapkit.Coordinate(near.lat, near.lng),
    new mapkit.CoordinateSpan(SEARCH_SPAN_DEGREES, SEARCH_SPAN_DEGREES),
  )
}

/**
 * Apple Maps address search for one field: autocomplete, resolve a pick to
 * its exact address + coordinates, and reverse-geocode a dropped pin.
 * MapKit loads when the field mounts; `status` says whether it can be used.
 */
export function useAppleAddressSearch() {
  const [status, setStatus] = useState<MapKitStatus>('loading')
  const servicesRef = useRef<Services | null>(null)
  // Settles once MapKit is usable (or not), so text typed while it loads still gets answers.
  const readyRef = useRef<Promise<Services | null>>(Promise.resolve(null))
  const pendingAutocompleteRef = useRef<number | null>(null)
  const reverseCacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let isCancelled = false
    readyRef.current = loadMapKit()
      .then((mapkit) => {
        if (isCancelled) return null
        servicesRef.current = {
          mapkit,
          search: new mapkit.Search({
            language: 'en',
            getsUserLocation: false,
            includeAddresses: true,
            includePointsOfInterest: true,
            includeQueries: false,
            limitToCountries: SEARCH_COUNTRIES,
          }),
          geocoder: new mapkit.Geocoder({ language: 'en', getsUserLocation: false }),
        }
        setStatus('ready')
        return servicesRef.current
      })
      .catch((error: unknown) => {
        if (isCancelled) return null
        if (!isMapKitUnconfiguredError(error)) console.error('[apple-maps] MapKit failed to load:', error)
        setStatus(isMapKitUnconfiguredError(error) ? 'unconfigured' : 'failed')
        return null
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const suggest = useCallback(async (query: string, near: LatLng): Promise<AddressSuggestion[]> => {
    const services = servicesRef.current ?? (await readyRef.current)
    if (!services || !query.trim()) return []
    if (pendingAutocompleteRef.current !== null) services.search.cancel(pendingAutocompleteRef.current)

    return new Promise((resolve) => {
      pendingAutocompleteRef.current = services.search.autocomplete(
        query,
        (error, data) => {
          pendingAutocompleteRef.current = null
          if (error) {
            console.error('[apple-maps] autocomplete failed:', error)
            resolve([])
            return
          }
          const suggestions = (data?.results ?? [])
            .map((result, index) => ({ key: `${index}:${autocompleteLabel(result)}`, label: autocompleteLabel(result), result }))
            .filter((suggestion) => suggestion.label.length > 0)
          resolve(suggestions)
        },
        { region: regionAround(services.mapkit, near) },
      )
    })
  }, [])

  /** The exact address and coordinates of an autocomplete pick, or null. */
  const resolveSuggestion = useCallback((suggestion: AddressSuggestion): Promise<AddressSelection | null> => {
    const services = servicesRef.current
    if (!services) return Promise.resolve(null)

    return new Promise((resolve) => {
      services.search.search(suggestion.result, (error, data) => {
        if (error) {
          console.error('[apple-maps] place lookup failed:', error)
          resolve(null)
          return
        }
        const place = data?.places?.[0]
        resolve(place ? placeToSelection(place) : null)
      })
    })
  }, [])

  /** Never rejects: readable coordinates when Apple has no address for the spot. */
  const reverseGeocode = useCallback((point: LatLng): Promise<string> => {
    const services = servicesRef.current
    const fallback = formatCoordinateFallback(point.lat, point.lng)
    if (!services) return Promise.resolve(fallback)

    const cacheKey = `${point.lat.toFixed(CACHE_PRECISION)}_${point.lng.toFixed(CACHE_PRECISION)}`
    const cached = reverseCacheRef.current.get(cacheKey)
    if (cached) return Promise.resolve(cached)

    return new Promise((resolve) => {
      services.geocoder.reverseLookup(new services.mapkit.Coordinate(point.lat, point.lng), (error, data) => {
        const place = data?.results?.[0]
        if (error || !place) {
          if (error) console.error('[apple-maps] reverse geocoding failed:', error)
          resolve(fallback)
          return
        }
        const address = formatPlaceAddress(place)
        reverseCacheRef.current.set(cacheKey, address)
        resolve(address)
      })
    })
  }, [])

  return { status, suggest, resolveSuggestion, reverseGeocode }
}
