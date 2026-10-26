'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, LocateFixed, Map as MapIcon, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { haversineDistanceKm } from '@/lib/delivery-fee'
import { parseCoordinateFallback, type LatLng } from '@/lib/maps/apple/mapkit-address'
import { AddressSuggestionList, suggestionOptionId, useSuggestionKeyboard } from './address-suggestion-list'
import { PinConfirmDialog, type PinCheckView, type PinPurpose } from './pin-confirm-dialog'
import { PinConfirmMap } from './pin-confirm-map'
import { PlainAddressInput } from './plain-address-input'
import { useAddressSuggestions, useAppleAddressSearch, type AddressSuggestion } from './use-apple-address-search'

/** Metro Manila: only when the store has no pin to start from. */
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }
/** A GPS fix that has not arrived by then is reported as a failure, not a spinner forever. */
const GEOLOCATION_TIMEOUT_MS = 15_000
/** A fix up to a minute old is still "where I am" for an address. */
const GEOLOCATION_MAX_AGE_MS = 60_000
/** A pin moved less than this from a searched place keeps the place's name as the address. */
const KEEP_PICKED_LABEL_KM = 0.04
const PREVIEW_SIZE_CLASS = 'h-36 sm:h-44'

export interface AddressChangeMeta {
  /** The spot was confirmed on the map, not just searched. */
  isConfirmed?: boolean
}

export interface AppleAddressAutocompleteProps {
  value: string
  onChange: (address: string, coordinates?: LatLng, meta?: AddressChangeMeta) => void
  placeholder?: string
  required?: boolean
  className?: string
  /** The saved location, so the map opens on it. */
  coordinates?: LatLng | null
  /** Where search leans and the map opens before there is a pin: the branch or store. */
  biasCenter?: LatLng | null
  /** A customer's door, or a store's entrance (changes the wording and the default map type). */
  purpose?: PinPurpose
  /** Warnings about a spot (too far, on the store itself, outside the country). */
  check?: (point: LatLng) => PinCheckView | null
  /** Rendered instead when this deployment has no Apple Maps key. */
  fallback: ReactNode
}

interface PendingPin {
  start: LatLng
  /** The searched place's address, kept if the pin stays on it. */
  label: string | null
  accuracyM: number | null
}

interface Located {
  point: LatLng
  accuracyM: number | null
}

function currentPosition(): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      reject,
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    )
  })
}

function isNear(a: LatLng, b: LatLng, km: number): boolean {
  return haversineDistanceKm(a.lat, a.lng, b.lat, b.lng) <= km
}

/**
 * The address field on Apple Maps. Search (biased to the store) or "use my
 * location" opens a map with a fixed centre pin; the spot is stored only once
 * it is confirmed there. Emits `(address, { lat, lng }?, meta?)`: text alone
 * while typing, coordinates once a spot is confirmed.
 */
export function AppleAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter your address',
  required = false,
  className = '',
  coordinates = null,
  biasCenter = null,
  purpose = 'delivery',
  check,
  fallback,
}: AppleAddressAutocompleteProps) {
  const { status, suggest, resolveSuggestion, reverseGeocode } = useAppleAddressSearch()
  const { suggestions, search, clear: clearSuggestions } = useAddressSuggestions(suggest)
  const [isFocused, setIsFocused] = useState(false)
  const [pending, setPending] = useState<PendingPin | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [pin, setPin] = useState<LatLng | null>(() => coordinates ?? parseCoordinateFallback(value))
  // Bumped by every keystroke: a pick still resolving when the diner types on
  // must not overwrite what they typed.
  const editGenerationRef = useRef(0)
  // The last address this field wrote itself (a search pick, a named pin).
  // Anything else in the box is the customer's own words, and a pin never
  // overwrites those.
  const machineAddressRef = useRef<string | null>(null)
  const listId = useId()
  const isListOpen = isFocused && suggestions.length > 0
  const startPoint = pin ?? biasCenter ?? DEFAULT_CENTER

  // The saved location is the truth: a pin set elsewhere moves ours, and a
  // pin the form dropped (the address was rewritten) clears ours.
  const savedLat = coordinates?.lat
  const savedLng = coordinates?.lng
  const hadSavedPinRef = useRef(coordinates !== null)
  useEffect(() => {
    if (savedLat === undefined || savedLng === undefined) {
      if (hadSavedPinRef.current) setPin(null)
      hadSavedPinRef.current = false
      return
    }
    hadSavedPinRef.current = true
    setPin((current) => (current?.lat === savedLat && current?.lng === savedLng ? current : { lat: savedLat, lng: savedLng }))
  }, [savedLat, savedLng])

  const handleType = (text: string) => {
    editGenerationRef.current += 1
    onChange(text)
    search(text, startPoint)
  }

  const handleSuggestionPick = useCallback(
    async (suggestion: AddressSuggestion) => {
      clearSuggestions()
      machineAddressRef.current = suggestion.label
      onChange(suggestion.label)
      const generation = editGenerationRef.current
      const selection = await resolveSuggestion(suggestion)
      if (!selection || generation !== editGenerationRef.current) return
      setPending({ start: selection.coordinates, label: selection.address, accuracyM: null })
    },
    [clearSuggestions, onChange, resolveSuggestion],
  )

  const { activeIndex, onKeyDown } = useSuggestionKeyboard(suggestions, handleSuggestionPick, clearSuggestions)

  const locate = useCallback(async (): Promise<Located | null> => {
    setError(null)
    try {
      return await currentPosition()
    } catch (caught) {
      console.error('[apple-maps] geolocation failed:', caught)
      setError('We could not get your location. Please allow location access, or search for your address.')
      return null
    }
  }, [])

  const handleLocate = useCallback(async () => {
    setIsLocating(true)
    const located = await locate()
    setIsLocating(false)
    if (located) setPending({ start: located.point, label: null, accuracyM: located.accuracyM })
  }, [locate])

  const handleConfirm = useCallback(
    async (point: LatLng) => {
      const label = pending?.label ?? null
      const keepsLabel = label !== null && pending !== null && isNear(point, pending.start, KEEP_PICKED_LABEL_KM)
      const hasText = value.trim() !== ''
      // The customer's own words (a house number, "near the chapel") are what
      // the rider needs; a store's typed address is what its customers read.
      // Moving the pin never rewrites either — only text this field wrote.
      const keepsTyped = hasText && (purpose === 'store' || value !== machineAddressRef.current)
      const address = keepsTyped ? value : keepsLabel ? label : await reverseGeocode(point)
      machineAddressRef.current = keepsTyped ? machineAddressRef.current : address
      setPin(point)
      onChange(address, point, { isConfirmed: true })
    },
    [onChange, pending, purpose, reverseGeocode, value],
  )

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

  const pinView = pin ? check?.(pin) ?? null : null
  // Not while they are still typing a search: only once they have left the field.
  const needsPin = !pin && !isFocused && value.trim() !== '' && status === 'ready'

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
          onClick={() => setPending({ start: startPoint, label: null, accuracyM: null })}
          disabled={status !== 'ready'}
          title="Pick on the map"
          aria-label="Pick on the map"
          className="shrink-0"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {needsPin ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <span>{purpose === 'store' ? 'Pin your entrance on the map so riders find you.' : 'Set your exact spot on the map so the rider finds you.'}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setPending({ start: startPoint, label: null, accuracyM: null })}>
            Set pin on map
          </Button>
        </div>
      ) : null}

      {pin ? (
        <section aria-label="Your location on the map" className="space-y-2">
          {previewError ? (
            <p className="text-sm text-gray-500">{previewError}</p>
          ) : (
            <PinConfirmMap center={pin} isInteractive={false} onError={setPreviewError} className={PREVIEW_SIZE_CLASS} />
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-600">{purpose === 'store' ? 'Entrance pinned' : 'Pin set — the rider goes here'}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setPending({ start: pin, label: null, accuracyM: null })}>
              Change pin
            </Button>
          </div>
          {pinView ? (
            <p className={`flex items-start gap-2 text-sm ${pinView.isBlocked ? 'text-red-700' : 'text-amber-800'}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {pinView.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <PinConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        start={pending?.start ?? startPoint}
        purpose={purpose}
        accuracyM={pending?.accuracyM ?? null}
        check={check}
        onLocate={locate}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
