'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { LocateFixed, Map as MapIcon, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseCoordinateFallback, type LatLng } from '@/lib/maps/apple/mapkit-address'
import { AddressSuggestionList, suggestionOptionId, useSuggestionKeyboard } from './address-suggestion-list'
import { AppleMapCanvas } from './apple-map-canvas'
import { AppleMapPickerDialog } from './apple-map-picker-dialog'
import { PlainAddressInput } from './plain-address-input'
import { useAddressSuggestions, useAppleAddressSearch, type AddressSuggestion } from './use-apple-address-search'

/** Metro Manila: where the map opens and search is biased before any pin exists. */
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }
/** A GPS fix that has not arrived by then is reported as a failure, not a spinner forever. */
const GEOLOCATION_TIMEOUT_MS = 15_000
/** A fix up to a minute old is still "where I am" for an address. */
const GEOLOCATION_MAX_AGE_MS = 60_000
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
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
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
  const { suggestions, search, clear: clearSuggestions } = useAddressSuggestions(suggest)
  const [isFocused, setIsFocused] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inlineMapError, setInlineMapError] = useState<string | null>(null)
  const [pin, setPin] = useState<LatLng | null>(() => coordinates ?? parseCoordinateFallback(value))
  // Bumped by every keystroke: a pick still resolving when the diner types on
  // must not overwrite what they typed.
  const editGenerationRef = useRef(0)
  const listId = useId()
  const isListOpen = isFocused && suggestions.length > 0

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
    editGenerationRef.current += 1
    onChange(text)
    search(text, pin ?? DEFAULT_CENTER)
  }

  const handleSuggestionPick = useCallback(
    async (suggestion: AddressSuggestion) => {
      clearSuggestions()
      // Show the pick at once; Apple's exact address and coordinates follow.
      onChange(suggestion.label)
      const generation = editGenerationRef.current
      const selection = await resolveSuggestion(suggestion)
      if (selection && generation === editGenerationRef.current) select(selection.address, selection.coordinates)
    },
    [clearSuggestions, onChange, resolveSuggestion, select],
  )

  const { activeIndex, onKeyDown } = useSuggestionKeyboard(suggestions, handleSuggestionPick, clearSuggestions)

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
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isListOpen}
            aria-controls={listId}
            aria-activedescendant={isListOpen && activeIndex >= 0 ? suggestionOptionId(listId, activeIndex) : undefined}
            value={value}
            onChange={(event) => handleType(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            required={required}
            autoComplete="address-line1"
            className={`pl-10 ${className} w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500`}
          />
          {isListOpen ? (
            <AddressSuggestionList
              id={listId}
              suggestions={suggestions}
              activeIndex={activeIndex}
              onSelect={handleSuggestionPick}
            />
          ) : null}
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
