'use client'

import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '@/lib/maps/apple/mapkit-address'
import { loadMapKit } from '@/lib/maps/apple/mapkit-loader'
import type { MapKit, MapKitAnnotation, MapKitEvent, MapKitMap } from '@/lib/maps/apple/mapkit-types'

/** Close enough to read house numbers. */
const STREET_CAMERA_DISTANCE_M = 900
const MARKER_COLOR = '#f97316'
/** A tap on a business label fires `select` and `single-tap`; the business wins. */
const FEATURE_TAP_GRACE_MS = 400
const SAME_POINT_EPSILON = 1e-7

interface AppleMapCanvasProps {
  /**
   * Where the pin sits; null until a location is chosen (the first tap drops it).
   * A new value from outside the map (search, GPS) re-centres it.
   */
  pin: LatLng | null
  /** Where the map opens when there is no pin yet. */
  initialCenter: LatLng
  /** The diner moved the pin: a tap, a drag, or a tapped business (with its name). */
  onPick: (point: LatLng, placeName: string | null) => void
  onError: (message: string) => void
  /** Sizing classes for the map box. */
  className?: string
}

interface MapHandles {
  mapkit: MapKit
  map: MapKitMap
  /** Created on the first pin, then moved. */
  marker: MapKitAnnotation | null
}

const DEFAULT_SIZE_CLASS = 'h-[60vh] min-h-[360px]'

function isSamePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < SAME_POINT_EPSILON && Math.abs(a.lng - b.lng) < SAME_POINT_EPSILON
}

function toLatLng(coordinate: { latitude: number; longitude: number }): LatLng {
  return { lat: coordinate.latitude, lng: coordinate.longitude }
}

function placeMarker(handles: MapHandles, point: LatLng, onDragEnd: (point: LatLng) => void): MapKitAnnotation {
  const coordinate = new handles.mapkit.Coordinate(point.lat, point.lng)
  if (handles.marker) {
    handles.marker.coordinate = coordinate
    return handles.marker
  }
  const marker = new handles.mapkit.MarkerAnnotation(coordinate, {
    color: MARKER_COLOR,
    title: 'Tap the map or drag the pin',
    draggable: true,
  })
  marker.addEventListener('drag-end', () => onDragEnd(toLatLng(marker.coordinate)))
  handles.map.addAnnotation(marker)
  handles.marker = marker
  return marker
}

export function AppleMapCanvas({ pin, initialCenter, onPick, onError, className = DEFAULT_SIZE_CLASS }: AppleMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<MapHandles | null>(null)
  // The pin as of now: MapKit can finish loading after the pin has moved
  // (a pick made while the map was still loading), and must open on it.
  const latestPinRef = useRef(pin)
  const initialCenterRef = useRef(initialCenter)
  const [hasPin, setHasPin] = useState(pin !== null)
  const onPickRef = useRef(onPick)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onPickRef.current = onPick
    onErrorRef.current = onError
  }, [onPick, onError])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let isCancelled = false
    let lastFeatureTapAt = 0

    loadMapKit()
      .then((mapkit) => {
        if (isCancelled) return
        const start = latestPinRef.current ?? initialCenterRef.current
        const map = new mapkit.Map(container, {
          center: new mapkit.Coordinate(start.lat, start.lng),
          cameraDistance: STREET_CAMERA_DISTANCE_M,
          showsMapTypeControl: true,
          showsZoomControl: true,
          showsUserLocationControl: false,
          isRotationEnabled: false,
        })
        if (mapkit.MapFeatureType) map.selectableMapFeatures = [mapkit.MapFeatureType.PointOfInterest]

        const handles: MapHandles = { mapkit, map, marker: null }
        const onDragEnd = (point: LatLng) => onPickRef.current(point, null)
        if (latestPinRef.current) {
          placeMarker(handles, latestPinRef.current, onDragEnd)
          setHasPin(true)
        }

        const movePin = (point: LatLng, placeName: string | null) => {
          placeMarker(handles, point, onDragEnd)
          setHasPin(true)
          onPickRef.current(point, placeName)
        }

        map.addEventListener('select', (event: MapKitEvent) => {
          const feature = event.annotation
          if (!feature || feature === handles.marker || !feature.featureType) return
          lastFeatureTapAt = Date.now()
          movePin(toLatLng(feature.coordinate), feature.title?.trim() || null)
          map.selectedAnnotation = null
        })
        map.addEventListener('single-tap', (event: MapKitEvent) => {
          if (!event.pointOnPage) return
          const point = toLatLng(map.convertPointOnPageToCoordinate(event.pointOnPage))
          // Let a business `select` from the same tap land first.
          setTimeout(() => {
            // The map may have been destroyed (dialog closed) in between.
            if (isCancelled) return
            if (Date.now() - lastFeatureTapAt > FEATURE_TAP_GRACE_MS) movePin(point, null)
          }, 0)
        })

        handlesRef.current = handles
      })
      .catch((error: unknown) => {
        console.error('[apple-maps] map failed to load:', error)
        if (!isCancelled) onErrorRef.current('The map could not load. Check your connection and try again.')
      })

    return () => {
      isCancelled = true
      handlesRef.current?.map.destroy()
      handlesRef.current = null
    }
  }, [])

  useEffect(() => {
    latestPinRef.current = pin
    const handles = handlesRef.current
    if (!handles || !pin) return
    // The pin already sits here when the diner put it there; only outside moves recentre.
    if (handles.marker && isSamePoint(toLatLng(handles.marker.coordinate), pin)) return
    placeMarker(handles, pin, (point) => onPickRef.current(point, null))
    setHasPin(true)
    handles.map.setCenterAnimated(new handles.mapkit.Coordinate(pin.lat, pin.lng), true)
    handles.map.setCameraDistanceAnimated(STREET_CAMERA_DISTANCE_M, true)
  }, [pin])

  return (
    <div className={`relative w-full overflow-hidden rounded-md border bg-gray-100 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {hasPin ? null : (
        <p className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow">
          Tap the map to drop your pin
        </p>
      )}
    </div>
  )
}
