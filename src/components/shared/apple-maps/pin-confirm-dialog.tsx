'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Layers, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { haversineDistanceKm } from '@/lib/delivery-fee'
import { nearLabel } from '@/lib/maps/address-query'
import { parseCoordinateFallback, type LatLng } from '@/lib/maps/apple/mapkit-address'
import { PinConfirmMap } from './pin-confirm-map'
import { PinMapSearch, type PinMapPlace, type PinMapSearchProps } from './pin-map-search'

/** What the caller's check says about the spot under the pin. */
export interface PinCheckView {
  /** True = this spot can't be used at all; Confirm is disabled. */
  isBlocked: boolean
  message: string
}

export type PinPurpose = 'delivery' | 'store'

/** Past this, a GPS fix is a neighbourhood, not a door. */
export const LOOSE_GPS_ACCURACY_M = 50
/** The map has stopped: long enough that a slow pan does not ask Apple at every pause. */
const DESCRIBE_DELAY_MS = 350
/** A pin moved less than this from a place searched here keeps the place's name. */
const KEEP_PLACE_KM = 0.04

const COPY: Record<PinPurpose, { title: string; description: string; confirm: string }> = {
  delivery: {
    title: 'Is this the exact spot?',
    description: 'Move the map until the pin is on your gate or door. The rider goes exactly here.',
    confirm: 'Confirm this spot',
  },
  store: {
    title: 'Pin your entrance',
    description: 'Drag the map so the pin is on your entrance, where riders pick up orders.',
    confirm: 'Save this spot',
  },
}

export interface PinConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the map opens. */
  start: LatLng
  purpose?: PinPurpose
  /** How far off the GPS fix that opened the map may be, in metres. */
  accuracyM?: number | null
  check?: (point: LatLng) => PinCheckView | null
  /** Re-centres on the device's position; resolves null when it could not get one. */
  onLocate?: () => Promise<{ point: LatLng; accuracyM: number | null } | null>
  /** A place found with the search on the map, when the pin is still on it. */
  onConfirm: (point: LatLng, place?: PinMapPlace | null) => Promise<void> | void
  /** Names the spot under the pin as the map moves. */
  describe?: (point: LatLng) => Promise<string>
  /** Search from the map itself, so a wrong start never means starting over. */
  search?: Pick<PinMapSearchProps, 'suggest' | 'resolveSuggestion'>
}

/**
 * Step two of an address: the customer (or merchant) confirms the exact spot
 * on a map with a fixed centre pin, sees any warning about it, and confirms.
 * Nothing is saved until Confirm.
 */
export function PinConfirmDialog(props: PinConfirmDialogProps) {
  // Remount per opening so the map and the "where it rests" state start fresh.
  return props.open ? <OpenPinConfirmDialog {...props} /> : null
}

function OpenPinConfirmDialog({
  onOpenChange,
  start,
  purpose = 'delivery',
  accuracyM: startAccuracyM = null,
  check,
  onLocate,
  onConfirm,
  describe,
  search,
}: PinConfirmDialogProps) {
  const copy = COPY[purpose]
  const [center, setCenter] = useState<LatLng>(start)
  // Roofs people recognise: the plain map shows empty blocks at this zoom in most of the Philippines.
  const [isSatellite, setIsSatellite] = useState(true)
  const [accuracyM, setAccuracyM] = useState<number | null>(startAccuracyM)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [hasMoved, setHasMoved] = useState(false)
  const [place, setPlace] = useState<PinMapPlace | null>(null)
  const [description, setDescription] = useState<{ point: LatLng; text: string } | null>(null)

  useEffect(() => {
    if (!describe) return
    let isStale = false
    const timer = setTimeout(() => {
      void describe(center).then((address) => {
        // "Lat: …, Lng: …" means Apple has no name for the spot: say nothing rather than show numbers.
        if (!isStale) setDescription({ point: center, text: parseCoordinateFallback(address) ? '' : nearLabel(address) })
      })
    }, DESCRIBE_DELAY_MS)
    return () => {
      isStale = true
      clearTimeout(timer)
    }
  }, [center, describe])

  const view = check?.(center) ?? null
  const isLooseFix = !hasMoved && accuracyM !== null && accuracyM > LOOSE_GPS_ACCURACY_M
  const confirmLabel = view && !view.isBlocked ? 'Yes, this is the right spot' : copy.confirm

  const handleCenterChange = (point: LatLng) => {
    setCenter(point)
    setHasMoved(true)
  }

  const handlePlace = (next: PinMapPlace) => {
    setPlace(next)
    setCenter(next.point)
    setAccuracyM(null)
    setHasMoved(false)
  }

  const handleLocate = async () => {
    if (!onLocate) return
    setIsLocating(true)
    try {
      const located = await onLocate()
      if (located) {
        setPlace(null)
        setCenter(located.point)
        setAccuracyM(located.accuracyM)
        setHasMoved(false)
      }
    } finally {
      setIsLocating(false)
    }
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    try {
      const isOnPlace = place !== null && haversineDistanceKm(place.point.lat, place.point.lng, center.lat, center.lng) <= KEEP_PLACE_KM
      await onConfirm(center, isOnPlace ? place : null)
      onOpenChange(false)
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-2 rounded-none border-0 p-3 sm:h-auto sm:max-h-[95vh] sm:max-w-2xl sm:gap-3 sm:rounded-lg sm:border sm:p-6">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {search ? <PinMapSearch {...search} near={center} onPlace={handlePlace} /> : null}

        <div className="relative min-h-0 flex-1">
          {mapError ? (
            <div className="flex h-full min-h-[280px] items-center sm:h-[50vh] justify-center rounded-md border bg-gray-50 p-4 text-center text-sm text-red-600">
              {mapError}
            </div>
          ) : (
            <PinConfirmMap
              center={center}
              onCenterChange={handleCenterChange}
              onError={setMapError}
              isSatellite={isSatellite}
              className="h-full min-h-[260px] sm:h-[55vh]"
            />
          )}
          <div className="absolute right-2 top-2 z-20 flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsSatellite((current) => !current)}
              aria-pressed={isSatellite}
              className="shadow"
            >
              <Layers className="mr-1 h-4 w-4" aria-hidden="true" />
              {isSatellite ? 'Map' : 'Satellite'}
            </Button>
            {onLocate ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLocate}
                disabled={isLocating}
                aria-label="Move the pin to my location"
                className="shadow"
              >
                <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''}`} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {describe ? (
          <p aria-live="polite" className="min-h-5 truncate text-sm text-gray-700">
            {description?.point === center && description.text ? `Near ${description.text}` : ''}
          </p>
        ) : null}

        {isLooseFix ? (
          <p className="text-sm text-gray-600">
            Your location is only accurate to about {Math.round(accuracyM ?? 0)} m. Move the map so the pin is on your door.
          </p>
        ) : null}
        {view ? (
          <p
            role="alert"
            className={`flex items-start gap-2 rounded-md p-3 text-sm ${view.isBlocked ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {view.message}
          </p>
        ) : null}

        <div className="flex shrink-0 justify-end gap-2 border-t pt-2 sm:pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isConfirming || view?.isBlocked === true || Boolean(mapError)}>
            {isConfirming ? 'Saving…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
