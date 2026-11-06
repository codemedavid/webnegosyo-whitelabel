'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, LocateFixed, Map as MapIcon, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AddressMapDisplay } from '@/lib/checkout/address-map'
import type { PinSource } from '@/lib/checkout/customer-field-input'
import { haversineDistanceKm } from '@/lib/delivery-fee'
import { addressAfterPick, withoutHouseNumber } from '@/lib/maps/address-query'
import { parseCoordinateFallback, type LatLng } from '@/lib/maps/apple/mapkit-address'
import { readPastedLocation, UNREADABLE_LINK_MESSAGE } from '@/lib/maps/read-pasted-location'
import { addressFieldPart, type AddressFieldTheme } from '../address-field-theme'
import { AddressSuggestionList, suggestionOptionId, useSuggestionKeyboard } from './address-suggestion-list'
import { PinConfirmDialog, type PinCheckView, type PinPurpose } from './pin-confirm-dialog'
import { PinConfirmMap } from './pin-confirm-map'
import type { PinMapPlace } from './pin-map-search'
import { PlainAddressInput } from './plain-address-input'
import { useAddressSuggestions, useAppleAddressSearch, type AddressSuggestion } from './use-apple-address-search'

/** Metro Manila: only when the store has no pin to start from. */
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }
/** A GPS fix that has not arrived by then is reported as a failure, not a spinner forever. */
const GEOLOCATION_TIMEOUT_MS = 15_000
/** A fix up to a minute old is still "where I am" for an address. */
const GEOLOCATION_MAX_AGE_MS = 60_000
/** Opening the map should not hang on a slow GPS: the store's area is a fine start. */
const QUICK_GEOLOCATION_TIMEOUT_MS = 4_000
const MAX_MEASURED_SECONDS = 3600
/** A pin moved less than this from a searched place keeps the place's name as the address. */
const KEEP_PICKED_LABEL_KM = 0.04
const PREVIEW_SIZE_CLASS = 'h-36 sm:h-44'
const MAP_BELOW_SIZE_CLASS = 'h-44'
/** Before there is a pin the map shows the area around the store: streets to recognise, not one gate. */
const NEIGHBOURHOOD_CAMERA_M = 1500
const LINK_CLASS = 'inline-flex min-h-10 items-center gap-1.5 text-sm font-medium disabled:opacity-50'

export interface AddressChangeMeta {
  /** The spot was confirmed on the map, not just searched. */
  isConfirmed?: boolean
  source?: PinSource
  /** From first touching the field to confirming the pin. */
  seconds?: number
  searchMisses?: number
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
  /** Themed page colours (the checkout); absent = the standard gray field. */
  theme?: AddressFieldTheme
  /** How the map is offered: icon buttons beside the box, links under it, or a map shown below it. */
  mapDisplay?: AddressMapDisplay
  /** The customer already chose to go without a pin: stop asking for one. */
  hidesPinNudge?: boolean
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

function currentPosition(timeoutMs: number = GEOLOCATION_TIMEOUT_MS): Promise<Located> {
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
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: GEOLOCATION_MAX_AGE_MS },
    )
  })
}

/** Only when the browser already has permission: never a prompt the customer didn't ask for. */
async function positionIfAllowed(): Promise<Located | null> {
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' })
    return permission.state === 'granted' ? await currentPosition(QUICK_GEOLOCATION_TIMEOUT_MS) : null
  } catch {
    return null
  }
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
  theme,
  mapDisplay = 'buttons',
  hidesPinNudge = false,
}: AppleAddressAutocompleteProps) {
  const { status, suggest, resolveSuggestion, reverseGeocode } = useAppleAddressSearch()
  const { suggestions, search, clear: clearSuggestions, missCountRef } = useAddressSuggestions(suggest)
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
  // What the customer had typed when they picked a result: their door and directions survive it.
  const typedAtPickRef = useRef('')
  const pinSourceRef = useRef<PinSource>('map')
  const firstTouchAtRef = useRef<number | null>(null)
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

  const noteFirstTouch = () => {
    firstTouchAtRef.current ??= Date.now()
  }

  const handleType = (text: string) => {
    noteFirstTouch()
    editGenerationRef.current += 1
    const generation = editGenerationRef.current
    onChange(text)
    void readPastedLocation(text).then((pasted) => {
      if (generation !== editGenerationRef.current) return
      if (!pasted) {
        search(text, startPoint)
        return
      }
      clearSuggestions()
      if (pasted.kind === 'point') {
        // The box held a link, not an address: the map names the spot on confirm.
        onChange('')
        pinSourceRef.current = 'link'
        setPending({ start: pasted.point, label: null, accuracyM: null })
      } else if (pasted.kind === 'query') {
        onChange(pasted.query)
        search(pasted.query, startPoint)
      } else {
        setError(UNREADABLE_LINK_MESSAGE)
      }
    })
  }

  const handleSuggestionPick = useCallback(
    async (suggestion: AddressSuggestion) => {
      clearSuggestions()
      // A customer's door stays theirs; a store's address is the place it picked.
      typedAtPickRef.current = purpose === 'delivery' ? value : ''
      const written = purpose === 'delivery' ? addressAfterPick(value, suggestion.label) : suggestion.label
      machineAddressRef.current = written
      pinSourceRef.current = 'search'
      onChange(written)
      const generation = editGenerationRef.current
      const selection = await resolveSuggestion(suggestion)
      if (!selection || generation !== editGenerationRef.current) return
      setPending({ start: selection.coordinates, label: selection.address, accuracyM: null })
    },
    [clearSuggestions, onChange, purpose, resolveSuggestion, value],
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
    firstTouchAtRef.current ??= Date.now()
    setIsLocating(true)
    const located = await locate()
    setIsLocating(false)
    if (located) {
      pinSourceRef.current = 'gps'
      setPending({ start: located.point, label: null, accuracyM: located.accuracyM })
    }
  }, [locate])

  const handleConfirm = useCallback(
    async (point: LatLng, place?: PinMapPlace | null) => {
      const startLabel = pending?.label ?? null
      const keepsStartLabel = startLabel !== null && pending !== null && isNear(point, pending.start, KEEP_PICKED_LABEL_KM)
      const hasText = value.trim() !== ''
      // The customer's own words (a house number, "near the chapel") are what
      // the rider needs; a store's typed address is what its customers read.
      // Moving the pin never rewrites either — only text this field wrote.
      const keepsTyped = hasText && (purpose === 'store' || value !== machineAddressRef.current)
      const named = async (): Promise<string> => {
        const known = place?.label ?? (keepsStartLabel ? startLabel : null)
        if (known !== null) return known
        const found = await reverseGeocode(point)
        // Maps guess the nearest house number, and it is rarely the customer's.
        return purpose === 'delivery' ? withoutHouseNumber(found) : found
      }
      const address = keepsTyped
        ? value
        : purpose === 'delivery'
          ? addressAfterPick(typedAtPickRef.current, await named())
          : await named()
      machineAddressRef.current = keepsTyped ? machineAddressRef.current : address
      setPin(point)
      const seconds = firstTouchAtRef.current === null ? undefined : Math.min(MAX_MEASURED_SECONDS, Math.round((Date.now() - firstTouchAtRef.current) / 1000))
      onChange(address, point, { isConfirmed: true, source: place?.source ?? pinSourceRef.current, seconds, searchMisses: missCountRef.current })
    },
    [missCountRef, onChange, pending, purpose, reverseGeocode, value],
  )

  const searchFromMap = useMemo(() => ({ suggest, resolveSuggestion }), [suggest, resolveSuggestion])

  if (status === 'unconfigured') return <>{fallback}</>
  if (status === 'failed') {
    return (
      <PlainAddressInput
        value={value}
        onChange={(text) => onChange(text)}
        placeholder={placeholder}
        required={required}
        className={className}
        theme={theme}
      />
    )
  }

  const pinView = pin ? check?.(pin) ?? null : null
  const openPicker = () => {
    noteFirstTouch()
    pinSourceRef.current = 'map'
    const atStart = (): void => setPending({ start: startPoint, label: null, accuracyM: null })
    // Near the customer, not the store, when the browser already knows where they are.
    if (pin || purpose !== 'delivery' || !navigator.permissions?.query) {
      atStart()
      return
    }
    setIsLocating(true)
    void positionIfAllowed().then((located) => {
      setIsLocating(false)
      if (located) setPending({ start: located.point, label: null, accuracyM: located.accuracyM })
      else atStart()
    })
  }
  // Not while they are still typing a search: only once they have left the field.
  // A map already on screen asks for the spot itself.
  const needsPin = !pin && !isFocused && value.trim() !== '' && status === 'ready' && mapDisplay !== 'map' && !hidesPinNudge
  const linkClass = `${LINK_CLASS} ${theme?.link ?? 'text-gray-700 hover:underline'}`

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className={`pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 ${theme?.icon ?? 'text-gray-400'}`} />
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
            data-part={addressFieldPart(theme, 'field')}
            className={`pl-10 text-ellipsis ${className} ${theme?.input ?? 'w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500'}`}
          />
          {isListOpen ? (
            <AddressSuggestionList
              id={listId}
              suggestions={suggestions}
              activeIndex={activeIndex}
              onSelect={handleSuggestionPick}
              theme={theme}
            />
          ) : null}
        </div>

        {mapDisplay === 'buttons' ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleLocate}
              disabled={isLocating || status !== 'ready'}
              title="Use my current location"
              aria-label="Use my current location"
              data-part={addressFieldPart(theme, 'button-alt')}
              className={theme ? `shrink-0 ${theme.button}` : 'shrink-0'}
            >
              <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''}`} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={openPicker}
              disabled={status !== 'ready'}
              title="Pick on the map"
              aria-label="Pick on the map"
              data-part={addressFieldPart(theme, 'button-alt')}
              className={theme ? `shrink-0 ${theme.button}` : 'shrink-0'}
            >
              <MapIcon className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>

      {mapDisplay !== 'buttons' ? (
        <div className="flex flex-wrap gap-x-5">
          <button type="button" onClick={handleLocate} disabled={isLocating || status !== 'ready'} data-part={addressFieldPart(theme, 'link')} className={linkClass}>
            <LocateFixed aria-hidden="true" className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''}`} />
            Use my location
          </button>
          {mapDisplay === 'links' && !pin ? (
            <button type="button" onClick={openPicker} disabled={status !== 'ready'} data-part={addressFieldPart(theme, 'link')} className={linkClass}>
              <MapIcon aria-hidden="true" className="h-4 w-4" />
              Pick on the map
            </button>
          ) : null}
        </div>
      ) : null}

      {mapDisplay === 'map' && !pin ? (
        <section aria-label="Your location on the map" className="relative">
          {previewError ? (
            <p data-part={addressFieldPart(theme, 'muted')} className={`text-sm ${theme?.muted ?? 'text-gray-500'}`}>{previewError}</p>
          ) : (
            <PinConfirmMap center={startPoint} isInteractive={false} showsPin={false} cameraDistanceM={NEIGHBOURHOOD_CAMERA_M} onError={setPreviewError} className={MAP_BELOW_SIZE_CLASS} />
          )}
          {/* The whole map is the way in; scrolling past it must never move it (a phone's thumb would get stuck). */}
          {!previewError ? (
            <button type="button" onClick={openPicker} disabled={status !== 'ready'} className="absolute inset-0 z-20 flex items-center justify-center p-3 focus-visible:outline-none">
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-md ${theme?.mapStrip ?? 'bg-white text-gray-900'}`}>
                <MapPin aria-hidden="true" className="h-4 w-4" />
                Set your exact spot
              </span>
            </button>
          ) : null}
        </section>
      ) : null}

      {error ? <p data-part={addressFieldPart(theme, 'error')} className={`text-sm ${theme?.error ?? 'text-red-600'}`}>{error}</p> : null}

      {needsPin ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <span>{purpose === 'store' ? 'Pin your entrance on the map so riders find you.' : 'Set your exact spot on the map so the rider finds you.'}</span>
          <Button type="button" size="sm" variant="outline" onClick={openPicker}>
            Set pin on map
          </Button>
        </div>
      ) : null}

      {pin ? (
        <section aria-label="Your location on the map" className="space-y-2">
          {previewError ? (
            <p data-part={addressFieldPart(theme, 'muted')} className={`text-sm ${theme?.muted ?? 'text-gray-500'}`}>{previewError}</p>
          ) : (
            <PinConfirmMap center={pin} isInteractive={false} isSatellite={purpose === 'delivery'} onError={setPreviewError} className={mapDisplay === 'map' ? MAP_BELOW_SIZE_CLASS : PREVIEW_SIZE_CLASS} />
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span data-part={addressFieldPart(theme, 'muted')} className={theme?.muted ?? 'text-gray-600'}>{purpose === 'store' ? 'Entrance pinned' : 'Pin set — the rider goes here'}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                noteFirstTouch()
                pinSourceRef.current = 'map'
                setPending({ start: pin, label: null, accuracyM: null })
              }}
              data-part={addressFieldPart(theme, 'button-alt')}
              className={theme?.button}
            >
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
        describe={reverseGeocode}
        search={searchFromMap}
      />
    </div>
  )
}
