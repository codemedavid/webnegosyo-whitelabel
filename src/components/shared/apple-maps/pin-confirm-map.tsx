'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'
import type { LatLng } from '@/lib/maps/apple/mapkit-address'
import { loadMapKit } from '@/lib/maps/apple/mapkit-loader'
import type { MapKit, MapKitMap } from '@/lib/maps/apple/mapkit-types'

/** Close enough to see the gate, not just the street. */
const DOOR_CAMERA_DISTANCE_M = 300
/** Below this a recentre request is the map's own position echoed back. */
const SAME_POINT_EPSILON = 1e-6

export interface PinConfirmMapProps {
  /**
   * Where the pin is. The map opens here, and a new value from outside
   * (search, "use my location") moves the map to it.
   */
  center: LatLng
  /** The map came to rest under the pin at this point. */
  onCenterChange?: (point: LatLng) => void
  onError: (message: string) => void
  isSatellite?: boolean
  /** False = a preview: no panning or zooming. */
  isInteractive?: boolean
  className?: string
}

interface MapHandles {
  mapkit: MapKit
  map: MapKitMap
}

function isSamePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < SAME_POINT_EPSILON && Math.abs(a.lng - b.lng) < SAME_POINT_EPSILON
}

function mapTypeFor(mapkit: MapKit, isSatellite: boolean): string {
  return isSatellite ? mapkit.Map.MapTypes.Hybrid : mapkit.Map.MapTypes.Standard
}

/**
 * A map with the pin FIXED in the middle: the customer moves the map under
 * it, the way Grab and foodpanda confirm a spot. A dragged marker is easy to
 * drop a street away on a phone; a fixed pin over a moving map is not.
 */
export function PinConfirmMap({
  center,
  onCenterChange,
  onError,
  isSatellite = false,
  isInteractive = true,
  className = 'h-[60vh] min-h-[320px]',
}: PinConfirmMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<MapHandles | null>(null)
  const latestCenterRef = useRef(center)
  // Where the map itself last came to rest, so that point coming back as the
  // `center` prop does not trigger a recentre.
  const restingCenterRef = useRef<LatLng | null>(null)
  const isSatelliteRef = useRef(isSatellite)
  const onCenterChangeRef = useRef(onCenterChange)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange
    onErrorRef.current = onError
  }, [onCenterChange, onError])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let isCancelled = false

    loadMapKit()
      .then((mapkit) => {
        if (isCancelled) return
        const start = latestCenterRef.current
        const map = new mapkit.Map(container, {
          center: new mapkit.Coordinate(start.lat, start.lng),
          cameraDistance: DOOR_CAMERA_DISTANCE_M,
          mapType: mapTypeFor(mapkit, isSatelliteRef.current),
          showsMapTypeControl: false,
          showsZoomControl: isInteractive,
          showsUserLocationControl: false,
          isRotationEnabled: false,
          isScrollEnabled: isInteractive,
          isZoomEnabled: isInteractive,
        })
        map.addEventListener('region-change-end', () => {
          const resting = { lat: map.center.latitude, lng: map.center.longitude }
          restingCenterRef.current = resting
          onCenterChangeRef.current?.(resting)
        })
        handlesRef.current = { mapkit, map }
      })
      .catch((error: unknown) => {
        console.error('[apple-maps] pin map failed to load:', error)
        if (!isCancelled) onErrorRef.current('The map could not load. Check your connection and try again.')
      })

    return () => {
      isCancelled = true
      handlesRef.current?.map.destroy()
      handlesRef.current = null
    }
    // The map is built once; later changes arrive through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    latestCenterRef.current = center
    const handles = handlesRef.current
    if (!handles) return
    const resting = restingCenterRef.current
    if (resting && isSamePoint(resting, center)) return
    handles.map.setCenterAnimated(new handles.mapkit.Coordinate(center.lat, center.lng), true)
  }, [center])

  useEffect(() => {
    isSatelliteRef.current = isSatellite
    const handles = handlesRef.current
    if (handles) handles.map.mapType = mapTypeFor(handles.mapkit, isSatellite)
  }, [isSatellite])

  return (
    <div className={`relative w-full overflow-hidden rounded-md border bg-gray-100 ${className}`}>
      <div ref={containerRef} className={`absolute inset-0 ${isInteractive ? '' : 'pointer-events-none'}`} />
      {/* The pin's tip sits exactly on the map's centre. */}
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
        <MapPin className="h-10 w-10 fill-orange-500 text-white drop-shadow-lg" strokeWidth={1.5} />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40" />
    </div>
  )
}
