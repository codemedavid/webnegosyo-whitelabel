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
  // The in-flight autocomplete: a newer query cancels it at Apple and settles
  // its promise empty, so no caller is left waiting on a cancelled request.
  const pendingAutocompleteRef = useRef<{ id: number; settle: () => void } | null>(null)
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
    const previous = pendingAutocompleteRef.current
    if (previous) {
      pendingAutocompleteRef.current = null
      services.search.cancel(previous.id)
      previous.settle()
    }

    return new Promise((resolve) => {
      let isSettled = false
      const settle = (suggestions: AddressSuggestion[]) => {
        if (isSettled) return
        isSettled = true
        resolve(suggestions)
      }
      // Not `const`: a synchronous answer runs the callback before the id exists.
      let requestId: number | null = null
      requestId = services.search.autocomplete(
        query,
        (error, data) => {
          if (requestId !== null && pendingAutocompleteRef.current?.id === requestId) pendingAutocompleteRef.current = null
          if (error) {
            console.error('[apple-maps] autocomplete failed:', error)
            settle([])
            return
          }
          const suggestions = (data?.results ?? [])
            .map((result, index) => ({ key: `${index}:${autocompleteLabel(result)}`, label: autocompleteLabel(result), result }))
            .filter((suggestion) => suggestion.label.length > 0)
          settle(suggestions)
        },
        { region: regionAround(services.mapkit, near) },
      )
      // A synchronous answer (cache hit) has already settled; nothing is in flight.
      if (!isSettled) pendingAutocompleteRef.current = { id: requestId, settle: () => settle([]) }
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

/** Below this many characters no search runs and the list is empty. */
export const MIN_SUGGESTION_QUERY_LENGTH = 3
const SUGGESTION_DEBOUNCE_MS = 250

type SuggestFn = (query: string, near: LatLng) => Promise<AddressSuggestion[]>

/**
 * The suggestion list for one search box: debounced, and only the answer to
 * the LATEST query is shown — a slow answer to an older query (or to text the
 * diner has since cleared, or a pick already made) is dropped.
 */
export function useAddressSuggestions(suggest: SuggestFn) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)

  useEffect(() => () => {
    generationRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const clear = useCallback(() => {
    generationRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = null
    setSuggestions([])
  }, [])

  const search = useCallback(
    (text: string, near: LatLng) => {
      clear()
      if (text.trim().length < MIN_SUGGESTION_QUERY_LENGTH) return
      const generation = generationRef.current
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void suggest(text, near).then((next) => {
          if (generation === generationRef.current) setSuggestions(next)
        })
      }, SUGGESTION_DEBOUNCE_MS)
    },
    [clear, suggest],
  )

  return { suggestions, search, clear }
}
