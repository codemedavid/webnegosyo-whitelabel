'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isMapKitUnconfiguredError, loadMapKit } from '@/lib/maps/apple/mapkit-loader'
import type { MapKit, MapKitAnnotation, MapKitEvent, MapKitMap } from '@/lib/maps/apple/mapkit-types'
import { pinSizeForCameraDistance } from '@/lib/superadmin/client-map/display'
import { isNewClient, type ClientPin } from '@/lib/superadmin/client-map/locate'
import {
  createClientMarkerElement,
  createClusterMarkerElement,
  fillClusterLogos,
  setMarkerSelected,
} from './marker-elements'

const CLUSTERING_ID = 'clients'
const PHILIPPINES_CENTER = { latitude: 12.4, longitude: 121.8 }
/** Far enough out to show the globe before the intro move onto the stores. */
const START_CAMERA_DISTANCE_M = 12_000_000
/** The whole archipelago, used when there is nothing to fit. */
const COUNTRY_CAMERA_DISTANCE_M = 2_400_000
/** Street level — the Mapbox map's SELECTED_ZOOM (15.5). */
const SELECTED_CAMERA_DISTANCE_M = 900
const FIT_PADDING = { top: 90, bottom: 90, left: 70, right: 70 }
/** Fitting stops at a few provinces wide — the Mapbox map's MAX_FIT_ZOOM (6.2). */
const MIN_FIT_SPAN_DEG = 3
/** Opening a cluster stops at street level even when its stores share one spot. */
const MIN_CLUSTER_SPAN_DEG = 0.01
/** Cluster pill: 28px logos + 3px padding + 1px border, top and bottom. */
const CLUSTER_HEIGHT_PX = 36

const UNCONFIGURED_MESSAGE = 'Apple Maps is not configured (APPLE_MAPKIT_* env vars).'
const LOAD_FAILED_MESSAGE = 'The map could not load. Check your connection and refresh.'

interface UseAppleClientMapOptions {
  pins: ClientPin[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface MapHandles {
  mapkit: MapKit
  map: MapKitMap
  annotations: MapKitAnnotation[]
}

/**
 * MapKit anchors an annotation at its element's BOTTOM centre; markers sit on
 * their coordinate by their centre, like the Mapbox markers (`anchor: 'center'`).
 */
function centredAnchor(heightPx: number): DOMPoint {
  return new DOMPoint(0, -heightPx / 2)
}

function padding(mapkit: MapKit) {
  return new mapkit.Padding(FIT_PADDING.top, FIT_PADDING.right, FIT_PADDING.bottom, FIT_PADDING.left)
}

function flyToClient({ mapkit, map }: Pick<MapHandles, 'mapkit' | 'map'>, pin: ClientPin) {
  map.setCenterAnimated(new mapkit.Coordinate(pin.lat, pin.lng), true)
  map.setCameraDistanceAnimated(SELECTED_CAMERA_DISTANCE_M, true)
}

function fitAllClients({ mapkit, map, annotations }: MapHandles, isAnimated: boolean) {
  map.setRotationAnimated(0, isAnimated)
  if (annotations.length === 0) {
    map.setCenterAnimated(new mapkit.Coordinate(PHILIPPINES_CENTER.latitude, PHILIPPINES_CENTER.longitude), isAnimated)
    map.setCameraDistanceAnimated(COUNTRY_CAMERA_DISTANCE_M, isAnimated)
    return
  }
  map.showItems(annotations, {
    animate: isAnimated,
    padding: padding(mapkit),
    minimumSpan: new mapkit.CoordinateSpan(MIN_FIT_SPAN_DEG, MIN_FIT_SPAN_DEG),
  })
}

function pinIdOf(annotation: MapKitAnnotation): string | null {
  const id = annotation.data?.id
  return typeof id === 'string' ? id : null
}

/** Keyboard activation (Enter/Space on the focused button) never reaches MapKit's `select`. */
function onKeyboardActivate(element: HTMLElement, activate: () => void) {
  element.addEventListener('click', (event) => {
    if (event.detail === 0) activate()
  })
}

export function useAppleClientMap({ pins, selectedId, onSelect }: UseAppleClientMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<MapHandles | null>(null)
  const elementsRef = useRef(new Map<string, HTMLElement>())
  const pinsRef = useRef(pins)
  const onSelectRef = useRef(onSelect)
  const selectedIdRef = useRef(selectedId)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isCancelled = false
    const elements = elementsRef.current
    const pinsById = new Map(pinsRef.current.map((pin) => [pin.id, pin]))
    const clusterMembers = new WeakMap<MapKitAnnotation, MapKitAnnotation[]>()

    function activate(handles: Pick<MapHandles, 'mapkit' | 'map'>, annotation: MapKitAnnotation) {
      const members = clusterMembers.get(annotation)
      if (members) {
        handles.map.showItems(members, {
          animate: true,
          padding: padding(handles.mapkit),
          minimumSpan: new handles.mapkit.CoordinateSpan(MIN_CLUSTER_SPAN_DEG, MIN_CLUSTER_SPAN_DEG),
        })
        return
      }
      const pin = pinsById.get(pinIdOf(annotation) ?? '')
      if (!pin) return
      flyToClient(handles, pin)
      onSelectRef.current(pin.id)
    }

    function pinAnnotation(handles: Pick<MapHandles, 'mapkit' | 'map'>, pin: ClientPin, pinPx: number) {
      const { mapkit } = handles
      const annotation: MapKitAnnotation = new mapkit.Annotation(
        new mapkit.Coordinate(pin.lat, pin.lng),
        () => {
          const element = createClientMarkerElement(pin, isNewClient(pin.createdAt, new Date()))
          setMarkerSelected(element, selectedIdRef.current === pin.id)
          onKeyboardActivate(element, () => activate(handles, annotation))
          elements.set(pin.id, element)
          return element
        },
        { clusteringIdentifier: CLUSTERING_ID, anchorOffset: centredAnchor(pinPx), calloutEnabled: false, data: { id: pin.id } },
      )
      return annotation
    }

    function clusterAnnotation(handles: Pick<MapHandles, 'mapkit' | 'map'>, cluster: MapKitAnnotation) {
      const { mapkit } = handles
      const members = cluster.memberAnnotations ?? []
      const annotation: MapKitAnnotation = new mapkit.Annotation(
        cluster.coordinate,
        () => {
          const element = createClusterMarkerElement(members.length)
          const memberPins = members
            .map((member) => pinsById.get(pinIdOf(member) ?? ''))
            .filter((pin): pin is ClientPin => Boolean(pin))
          fillClusterLogos(element, memberPins)
          onKeyboardActivate(element, () => activate(handles, annotation))
          return element
        },
        { anchorOffset: centredAnchor(CLUSTER_HEIGHT_PX), calloutEnabled: false },
      )
      clusterMembers.set(annotation, members)
      return annotation
    }

    function createMap(mapkit: MapKit, host: HTMLDivElement): MapHandles {
      const map = new mapkit.Map(host, {
        center: new mapkit.Coordinate(PHILIPPINES_CENTER.latitude, PHILIPPINES_CENTER.longitude),
        cameraDistance: START_CAMERA_DISTANCE_M,
        colorScheme: mapkit.Map.ColorSchemes.Dark,
        showsPointsOfInterest: false,
        showsMapTypeControl: false,
        showsZoomControl: true,
        showsUserLocationControl: false,
        showsCompass: mapkit.FeatureVisibility.Adaptive,
        isRotationEnabled: true,
      })
      const base = { mapkit, map }

      let pinPx = pinSizeForCameraDistance(map.cameraDistance)
      host.style.setProperty('--pin', `${pinPx}px`)
      map.annotationForCluster = (cluster) => clusterAnnotation(base, cluster)
      const annotations = pinsRef.current.map((pin) => pinAnnotation(base, pin, pinPx))
      map.addAnnotations(annotations)

      // `--pin` resizes every marker; the anchor follows so each stays centred.
      map.addEventListener('region-change-end', () => {
        const next = pinSizeForCameraDistance(map.cameraDistance)
        if (next === pinPx) return
        pinPx = next
        host.style.setProperty('--pin', `${next}px`)
        annotations.forEach((annotation) => {
          annotation.anchorOffset = centredAnchor(next)
        })
      })
      map.addEventListener('select', (event: MapKitEvent) => {
        if (!event.annotation) return
        // Selection is drawn by the marker itself; clearing MapKit's lets a re-tap fly again.
        map.selectedAnnotation = null
        activate(base, event.annotation)
      })

      return { mapkit, map, annotations }
    }

    async function init(host: HTMLDivElement) {
      try {
        const mapkit = await loadMapKit()
        if (isCancelled) return
        const handles = createMap(mapkit, host)
        handlesRef.current = handles
        setIsReady(true)
        // Let the globe paint once so the move onto the stores reads as an intro.
        requestAnimationFrame(() => {
          if (!isCancelled) fitAllClients(handles, true)
        })
      } catch (err) {
        if (isCancelled) return
        if (isMapKitUnconfiguredError(err)) {
          setError(UNCONFIGURED_MESSAGE)
          return
        }
        console.error('[client-map] failed to initialise Apple Maps:', err)
        setError(LOAD_FAILED_MESSAGE)
      }
    }

    void init(container)

    return () => {
      isCancelled = true
      elements.clear()
      handlesRef.current?.map.destroy()
      handlesRef.current = null
    }
  }, [])

  useEffect(() => {
    selectedIdRef.current = selectedId
    elementsRef.current.forEach((element, id) => setMarkerSelected(element, id === selectedId))
  }, [selectedId])

  const flyToPin = useCallback((pin: ClientPin) => {
    if (handlesRef.current) flyToClient(handlesRef.current, pin)
  }, [])

  const resetView = useCallback(() => {
    if (handlesRef.current) fitAllClients(handlesRef.current, true)
  }, [])

  return { containerRef, isReady, error, flyToPin, resetView }
}
