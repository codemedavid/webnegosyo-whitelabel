'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapboxMap, Marker } from 'mapbox-gl'
import { isNewClient, type ClientPin } from '@/lib/superadmin/client-map/locate'
import {
  createClientMarkerElement,
  createClusterMarkerElement,
  fillClusterLogos,
  setMarkerSelected,
} from './marker-elements'

type MapboxModule = typeof import('mapbox-gl')['default']

const SOURCE_ID = 'smartmenu-clients'
const PHILIPPINES_CENTER: [number, number] = [121.8, 12.4]
const START_ZOOM = 1.3
const INTRO_DURATION_MS = 3600
const FLY_DURATION_MS = 2200
const SELECTED_ZOOM = 15.5
const FIT_PADDING = { top: 90, bottom: 90, left: 70, right: 70 }
const MAX_FIT_ZOOM = 6.2
/** Only pins that would actually overlap merge; past this zoom nothing merges. */
const CLUSTER_RADIUS_PX = 34
const CLUSTER_MAX_ZOOM = 14
const CLUSTER_LOGO_COUNT = 3

/** Logo diameter by zoom: small over the whole country, full size on the street. */
const PIN_SIZES: Array<[maxZoom: number, sizePx: number]> = [
  [7, 30],
  [11, 38],
]
const CLOSE_UP_PIN_PX = 46

function pinSizeForZoom(zoom: number): number {
  return PIN_SIZES.find(([maxZoom]) => zoom < maxZoom)?.[1] ?? CLOSE_UP_PIN_PX
}

interface PointEntry {
  marker: Marker
  element: HTMLElement
  isOnMap: boolean
}

interface UseClientMapOptions {
  pins: ClientPin[]
  selectedId: string | null
  onSelect: (id: string) => void
  accessToken: string
}

function toFeatureCollection(pins: ClientPin[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      properties: { id: pin.id },
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
    })),
  }
}

function boundsOf(pins: ClientPin[]): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null
  const lngs = pins.map((pin) => pin.lng)
  const lats = pins.map((pin) => pin.lat)
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

function flyToClient(map: MapboxMap, pin: ClientPin) {
  map.flyTo({
    center: [pin.lng, pin.lat],
    zoom: SELECTED_ZOOM,
    pitch: 55,
    bearing: -18,
    duration: FLY_DURATION_MS,
    essential: true,
  })
}

export function useClientMap({ pins, selectedId, onSelect, accessToken }: UseClientMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const pointsRef = useRef(new Map<string, PointEntry>())
  const clustersRef = useRef(new Map<number, Marker>())
  const pinsRef = useRef(pins)
  const onSelectRef = useRef(onSelect)
  const selectedIdRef = useRef(selectedId)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const fitAll = useCallback((duration: number) => {
    const map = mapRef.current
    if (!map) return
    const bounds = boundsOf(pinsRef.current)
    if (!bounds) {
      map.flyTo({ center: PHILIPPINES_CENTER, zoom: 5, pitch: 0, bearing: 0, duration })
      return
    }
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM, pitch: 0, bearing: 0, duration })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !accessToken) return

    let isCancelled = false
    const points = pointsRef.current
    const clusters = clustersRef.current
    const pinsById = new Map(pinsRef.current.map((pin) => [pin.id, pin]))

    function pointEntry(mapboxgl: MapboxModule, map: MapboxMap, pin: ClientPin): PointEntry {
      const existing = points.get(pin.id)
      if (existing) return existing
      const element = createClientMarkerElement(pin, isNewClient(pin.createdAt, new Date()))
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        flyToClient(map, pin)
        onSelectRef.current(pin.id)
      })
      setMarkerSelected(element, selectedIdRef.current === pin.id)
      const marker = new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat([pin.lng, pin.lat])
      const entry = { marker, element, isOnMap: false }
      points.set(pin.id, entry)
      return entry
    }

    function clusterMarker(
      mapboxgl: MapboxModule,
      map: MapboxMap,
      clusterId: number,
      count: number,
      at: [number, number],
    ): Marker {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource
      const element = createClusterMarkerElement(count)
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return
          map.easeTo({ center: at, zoom: zoom + 0.5, duration: 900 })
        })
      })
      source.getClusterLeaves(clusterId, CLUSTER_LOGO_COUNT, 0, (err, leaves) => {
        if (err || !leaves) return
        const members = leaves
          .map((leaf) => pinsById.get(String(leaf.properties?.id)))
          .filter((pin): pin is ClientPin => Boolean(pin))
        fillClusterLogos(element, members)
      })
      return new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat(at).addTo(map)
    }

    /** Shows exactly what the clustered source says is visible: clusters or single stores. */
    function syncMarkers(mapboxgl: MapboxModule, map: MapboxMap) {
      if (!map.getSource(SOURCE_ID) || !map.isSourceLoaded(SOURCE_ID)) return
      const visibleClusters = new Set<number>()
      const visiblePoints = new Set<string>()

      for (const feature of map.querySourceFeatures(SOURCE_ID)) {
        const props = feature.properties ?? {}
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number]

        if (props.cluster) {
          const clusterId = Number(props.cluster_id)
          if (visibleClusters.has(clusterId)) continue
          visibleClusters.add(clusterId)
          if (!clusters.has(clusterId)) {
            clusters.set(clusterId, clusterMarker(mapboxgl, map, clusterId, Number(props.point_count), coordinates))
          }
          continue
        }

        const pin = pinsById.get(String(props.id))
        if (!pin || visiblePoints.has(pin.id)) continue
        visiblePoints.add(pin.id)
        const entry = pointEntry(mapboxgl, map, pin)
        if (!entry.isOnMap) {
          entry.marker.addTo(map)
          entry.isOnMap = true
        }
      }

      clusters.forEach((marker, clusterId) => {
        if (visibleClusters.has(clusterId)) return
        marker.remove()
        clusters.delete(clusterId)
      })
      points.forEach((entry, id) => {
        if (visiblePoints.has(id) || !entry.isOnMap) return
        entry.marker.remove()
        entry.isOnMap = false
      })
    }

    async function init(host: HTMLDivElement) {
      try {
        const mapboxgl = (await import('mapbox-gl')).default
        if (isCancelled) return
        mapboxgl.accessToken = accessToken

        const map = new mapboxgl.Map({
          container: host,
          style: 'mapbox://styles/mapbox/standard',
          config: {
            basemap: {
              lightPreset: 'night',
              showPointOfInterestLabels: false,
              showTransitLabels: false,
            },
          },
          projection: 'globe',
          center: PHILIPPINES_CENTER,
          zoom: START_ZOOM,
          attributionControl: false,
        })
        mapRef.current = map
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right')

        const syncPinSize = () => host.style.setProperty('--pin', `${pinSizeForZoom(map.getZoom())}px`)
        syncPinSize()
        map.on('zoom', syncPinSize)

        map.on('style.load', () => {
          if (map.getSource(SOURCE_ID)) return
          map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: toFeatureCollection(pinsRef.current),
            cluster: true,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            clusterRadius: CLUSTER_RADIUS_PX,
          })
          // Invisible layer: a source only loads tiles (and so answers
          // querySourceFeatures) while a layer uses it. Markers are DOM.
          map.addLayer({
            id: `${SOURCE_ID}-anchor`,
            type: 'circle',
            source: SOURCE_ID,
            paint: { 'circle-radius': 1, 'circle-opacity': 0 },
          })
        })

        map.on('render', () => syncMarkers(mapboxgl, map))
        map.once('load', () => {
          if (isCancelled) return
          setIsReady(true)
          fitAll(INTRO_DURATION_MS)
        })
        map.on('error', (event) => {
          console.error('[client-map] map error:', event.error)
        })
      } catch (err) {
        console.error('[client-map] failed to initialise the map:', err)
        if (!isCancelled) setError('The map could not load. Check your connection and refresh.')
      }
    }

    void init(container)

    return () => {
      isCancelled = true
      clusters.forEach((marker) => marker.remove())
      clusters.clear()
      points.forEach((entry) => entry.marker.remove())
      points.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [accessToken, fitAll])

  useEffect(() => {
    selectedIdRef.current = selectedId
    pointsRef.current.forEach((entry, id) => setMarkerSelected(entry.element, id === selectedId))
  }, [selectedId])

  const flyToPin = useCallback((pin: ClientPin) => {
    if (mapRef.current) flyToClient(mapRef.current, pin)
  }, [])

  const resetView = useCallback(() => fitAll(1600), [fitAll])

  return { containerRef, isReady, error, flyToPin, resetView }
}
