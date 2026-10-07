'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LocateFixed, Map as MapIcon, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseCoordinateFallback, type LatLng } from '@/lib/maps/apple/mapkit-address'
import { AddressSuggestionList } from './address-suggestion-list'
import { AppleMapCanvas } from './apple-map-canvas'
import { AppleMapPickerDialog } from './apple-map-picker-dialog'
import { PlainAddressInput } from './plain-address-input'
import { useAppleAddressSearch, type AddressSuggestion } from './use-apple-address-search'

/** Metro Manila: where the map opens and search is biased before any pin exists. */
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }
const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 3
const INLINE_MAP_SIZE_CLASS = 'h-56 sm:h-64'

export interface AppleAddressAutocompleteProps {
  value: string
  onChange: (address: string, coordinates?: LatLng) => void
  placeholder?: string
  required?: boolean
  className?: string
  /** The saved location, so the map opens on it. */
  coordinates?: LatLng | null
  /** Rendered instead when this deployment has no Apple Maps key. */
  fallback: ReactNode
}

function joinPlaceName(placeName: string | null, address: string): string {
  if (!placeName || address.toLowerCase().includes(placeName.toLowerCase())) return address
  return `${placeName}, ${address}`
}

function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
    )
  })
}

/**
 * The address field on Apple Maps: type-ahead from Apple's search, a pick
 * resolved to Apple's exact address and coordinates, "use my location", and a
 * map to tap or drag the pin. Emits the same `(address, { lat, lng }?)` as the
 * Mapbox field: text alone while typing, coordinates once a place is chosen.
 */
export function AppleAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter your address',
  required = false,
  className = '',
  coordinates = null,
  fallback,
}: AppleAddressAutocompleteProps) {
  const { status, suggest, resolveSuggestion, reverseGeocode } = useAppleAddressSearch()
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isListOpen, setIsListOpen] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inlineMapError, setInlineMapError] = useState<string | null>(null)
  const [pin, setPin] = useState<LatLng | null>(() => coordinates ?? parseCoordinateFallback(value))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // A location saved or typed elsewhere in the form moves the pin too.
  const savedLat = coordinates?.lat
  const savedLng = coordinates?.lng
  useEffect(() => {
    if (savedLat === undefined || savedLng === undefined) return
    setPin((current) => (current?.lat === savedLat && current?.lng === savedLng ? current : { lat: savedLat, lng: savedLng }))
  }, [savedLat, savedLng])

  const select = useCallback(
    (address: string, point: LatLng) => {
      setPin(point)
      onChange(address, point)
    },
    [onChange],
  )

  const handleType = (text: string) => {
    onChange(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setIsListOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      void suggest(text, pin ?? DEFAULT_CENTER).then((next) => {
        setSuggestions(next)
        setIsListOpen(next.length > 0)
      })
    }, SEARCH_DEBOUNCE_MS)
  }

  const handleSuggestionPick = useCallback(
    async (suggestion: AddressSuggestion) => {
      setSuggestions([])
      setIsListOpen(false)
      // Show the pick at once; Apple's exact address and coordinates follow.
      onChange(suggestion.label)
      const selection = await resolveSuggestion(suggestion)
      if (selection) select(selection.address, selection.coordinates)
    },
    [onChange, resolveSuggestion, select],
  )

  const handleMapPick = useCallback(
    async (point: LatLng, placeName: string | null) => {
      setPin(point)
      select(joinPlaceName(placeName, await reverseGeocode(point)), point)
    },
    [reverseGeocode, select],
  )

  const handleLocate = useCallback(async () => {
    setIsLocating(true)
    setError(null)
    try {
      const point = await currentPosition()
      select(await reverseGeocode(point), point)
    } catch (caught) {
      console.error('[apple-maps] geolocation failed:', caught)
      setError('We could not get your location. Please allow location access, or type your address.')
    } finally {
      setIsLocating(false)
    }
  }, [reverseGeocode, select])

  if (status === 'unconfigured') return <>{fallback}</>
  if (status === 'failed') {
    return (
      <PlainAddressInput
        value={value}
        onChange={(text) => onChange(text)}
        placeholder={placeholder}
        required={required}
        className={className}
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            name="address"
            type="text"
            value={value}
            onChange={(event) => handleType(event.target.value)}
            onFocus={() => setIsListOpen(suggestions.length > 0)}
            onBlur={() => setIsListOpen(false)}
            placeholder={placeholder}
            required={required}
            autoComplete="address-line1"
            className={`pl-10 ${className} w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500`}
          />
          {isListOpen ? <AddressSuggestionList suggestions={suggestions} onSelect={handleSuggestionPick} /> : null}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleLocate}
          disabled={isLocating || status !== 'ready'}
          title="Use my current location"
          aria-label="Use my current location"
          className="shrink-0"
        >
          <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''}`} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setIsPickerOpen(true)}
          disabled={status !== 'ready'}
          title="Pick on the map"
          aria-label="Pick on the map"
          className="shrink-0"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section aria-label="Your location on the map">
        {inlineMapError ? (
          <p className="text-sm text-gray-500">{inlineMapError}</p>
        ) : (
          <AppleMapCanvas
            pin={pin}
            initialCenter={DEFAULT_CENTER}
            onPick={handleMapPick}
            onError={setInlineMapError}
            className={INLINE_MAP_SIZE_CLASS}
          />
        )}
      </section>

      <AppleMapPickerDialog
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        pin={pin}
        initialCenter={DEFAULT_CENTER}
        isLocating={isLocating}
        onMapPick={handleMapPick}
        onSuggestionPick={handleSuggestionPick}
        onLocate={handleLocate}
        suggest={suggest}
      />
    </div>
  )
}
