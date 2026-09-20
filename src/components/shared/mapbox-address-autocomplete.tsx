'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, LocateFixed, Map, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useMapboxStylesheet } from '@/hooks/use-mapbox-stylesheet'
import { reverseGeocodeAddress } from '@/lib/geocoding/mapbox-geocoding'
import {
  createSessionToken,
  retrieveSuggestionCoordinates,
  suggestAddresses,
  type SearchBoxSuggestion,
} from '@/lib/geocoding/mapbox-search-box'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Metro Manila — the map's opening view and the default bias for address search.
const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 }
const DEFAULT_MAP_ZOOM = 13
// Keystrokes within one Search Box session are free, so autocomplete can feel immediate;
// the old 500ms wait existed only to respect Nominatim's 1 req/sec cap. Debouncing still
// earns its keep — Mapbox starts a second billable session past 50 suggests in one.
const SEARCH_DEBOUNCE_MS = 250
const MARKER_DRAG_DEBOUNCE_MS = 500

interface MapboxAddressAutocompleteProps {
  value: string
  onChange: (address: string, coordinates?: { lat: number; lng: number }) => void
  placeholder?: string
  required?: boolean
  className?: string
  mapboxEnabled?: boolean // If false, shows regular input without Mapbox features
}

export function MapboxAddressAutocomplete({
  value,
  onChange,
  placeholder = 'Enter your address',
  required = false,
  className = '',
  mapboxEnabled = true,
}: MapboxAddressAutocompleteProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const [mapSearchResults, setMapSearchResults] = useState<SearchBoxSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [mainSearchResults, setMainSearchResults] = useState<SearchBoxSuggestion[]>([])
  const [showMainSearchResults, setShowMainSearchResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapSearchInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mapSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Cache for reverse geocoding results to avoid redundant API calls
  // Key: "lat_lng" (rounded to 4 decimal places), Value: address string
  const geocodeCacheRef = useRef<Record<string, string>>({})

  // mapbox-gl's stylesheet is loaded here, on demand, instead of in the root layout.
  useMapboxStylesheet(mapboxEnabled)

  useEffect(() => {
    setIsClient(true)
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    if (token) {
      setAccessToken(token)
    } else {
      console.warn('Mapbox access token not found')
    }
  }, [])

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Mirrored into a ref so the geocoding callbacks below keep a stable identity and
  // don't force the map (initialized once) to re-create its event handlers.
  const accessTokenRef = useRef<string | null>(null)
  useEffect(() => {
    accessTokenRef.current = accessToken
  }, [accessToken])

  // Search Box bills per session, not per request: every keystroke sharing this token is
  // free, and the session is charged once. Held across a search, replaced after a pick.
  const sessionTokenRef = useRef<string | null>(null)
  const getSessionToken = useCallback((): string => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = createSessionToken()
    }
    return sessionTokenRef.current
  }, [])
  const endSearchSession = useCallback(() => {
    sessionTokenRef.current = null
  }, [])

  // Bias search results toward what the user is currently looking at. Proximity is the
  // single biggest accuracy lever for local search.
  const getSearchProximity = useCallback((): { lat: number; lng: number } => {
    const center = mapRef.current?.getCenter?.()
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      return { lat: center.lat, lng: center.lng }
    }
    return DEFAULT_MAP_CENTER
  }, [])

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
      if (mapSearchDebounceRef.current) {
        clearTimeout(mapSearchDebounceRef.current)
      }
    }
  }, [])

  const handleAddressSelect = useCallback((address: string, coordinates?: { lat: number; lng: number }) => {
    setLocalValue(address)
    onChange(address, coordinates)
  }, [onChange])

  // Handle main search box autocomplete using the Mapbox Search Box API, which (unlike
  // the Geocoding API) indexes points of interest — what customers actually type.
  const handleMainSearch = useCallback((query: string) => {
    // Clear any pending search
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    if (!query.trim()) {
      setMainSearchResults([])
      setShowMainSearchResults(false)
      return
    }

    searchDebounceRef.current = setTimeout(async () => {
      const results = await suggestAddresses(
        query,
        accessTokenRef.current ?? '',
        getSessionToken(),
        { proximity: getSearchProximity() }
      )

      setMainSearchResults(results)
      setShowMainSearchResults(results.length > 0)
    }, SEARCH_DEBOUNCE_MS)
  }, [getSearchProximity, getSessionToken])

  const handleMainSearchResultSelect = useCallback(async (result: SearchBoxSuggestion) => {
    // Show the chosen address immediately; the coordinates arrive a round-trip later.
    handleAddressSelect(result.place_name)
    setMainSearchResults([])
    setShowMainSearchResults(false)

    const coordinates = await retrieveSuggestionCoordinates(
      result.mapbox_id,
      accessTokenRef.current ?? '',
      getSessionToken()
    )
    endSearchSession()

    if (coordinates) {
      const [lng, lat] = coordinates
      handleAddressSelect(result.place_name, { lat, lng })
    }
  }, [handleAddressSelect, getSessionToken, endSearchSession])

  // Use ref to store the latest handleAddressSelect to avoid dependency issues
  const handleAddressSelectRef = useRef(handleAddressSelect)
  useEffect(() => {
    handleAddressSelectRef.current = handleAddressSelect
  }, [handleAddressSelect])

  // Helper function to round coordinates for cache key (4 decimal places = ~11m precision)
  const getCacheKey = useCallback((lat: number, lng: number): string => {
    return `${lat.toFixed(4)}_${lng.toFixed(4)}`
  }, [])

  // Cached reverse geocoding via the Mapbox Geocoding API. Never rejects — it resolves
  // to readable coordinates when the lookup fails, so a dropped pin still yields a value.
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    const cacheKey = getCacheKey(lat, lng)
    const cached = geocodeCacheRef.current[cacheKey]
    if (cached) {
      return cached
    }

    const address = await reverseGeocodeAddress(lat, lng, accessTokenRef.current ?? '')
    geocodeCacheRef.current[cacheKey] = address
    return address
  }, [getCacheKey])

  const handleUseCurrentLocation = useCallback(async (centerMap = false) => {
    if (!navigator.geolocation) {
      setMapError('Geolocation is not supported by your browser')
      return
    }

    setIsGettingLocation(true)
    setMapError(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        
        // If map is open, center on current location
        if (centerMap && mapRef.current && markerRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 15,
            duration: 1000,
          })
          markerRef.current.setLngLat([longitude, latitude])
        }
        
        // Reverse geocode to get address (using cache)
        const address = await reverseGeocode(latitude, longitude)
        handleAddressSelect(address, { lat: latitude, lng: longitude })
        
        setIsGettingLocation(false)
      },
      (error) => {
        console.error('Geolocation error:', error)
        setMapError('Failed to get your location. Please enable location permissions.')
        setIsGettingLocation(false)
      }
    )
  }, [reverseGeocode, handleAddressSelect])

  const initializeMap = useCallback(async () => {
    if (!mapContainerRef.current || !accessToken || mapRef.current) {
      console.log('Map initialization skipped:', { hasContainer: !!mapContainerRef.current, hasToken: !!accessToken, alreadyExists: !!mapRef.current })
      return
    }

    try {
      // Wait a bit for the dialog to fully render
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!mapContainerRef.current) {
        console.error('Map container is not available')
        return
      }

      const mapboxgl = (await import('mapbox-gl')).default
      mapboxgl.accessToken = accessToken

      // Get initial coordinates from current value or default to Manila
      let initialLng = DEFAULT_MAP_CENTER.lng
      let initialLat = DEFAULT_MAP_CENTER.lat

      // Try to parse coordinates from value or use last saved location
      const currentValue = localValue
      if (currentValue && currentValue.includes('Lat:')) {
        const match = currentValue.match(/Lat:\s*([\d.-]+),\s*Lng:\s*([\d.-]+)/)
        if (match) {
          initialLat = parseFloat(match[1])
          initialLng = parseFloat(match[2])
        }
      }

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [initialLng, initialLat],
        zoom: DEFAULT_MAP_ZOOM,
        attributionControl: true,
      })

      // Add navigation controls (zoom in/out)
      const mapboxglModule = await import('mapbox-gl')
      const nav = new mapboxglModule.default.NavigationControl()
      map.addControl(nav, 'top-right')

      // Clear any previous errors
      setMapError(null)

      // Wait for map to load
      map.on('load', () => {
        console.log('Map loaded successfully')
        // Only resize once on load, not during interactions
        map.resize()
      })

      map.on('error', (e) => {
        console.error('Map error:', e)
        setMapError('Map failed to load. Please check your Mapbox token.')
      })

      // Add marker with popup
      const popup = new mapboxgl.Popup({ offset: 25, closeOnClick: false })
        .setText('Click or drag to set delivery location')
      
      const marker = new mapboxgl.Marker({ 
        draggable: true,
        color: '#f97316' // Orange color to match theme
      })
        .setLngLat([initialLng, initialLat])
        .setPopup(popup)
        .addTo(map)
      
      // Open popup initially
      marker.togglePopup()

      markerRef.current = marker

      // Handle map click with POI snapping
      map.on('click', async (e) => {
        const { lng, lat } = e.lngLat

        // Try to snap to a visible POI label first (e.g., 7-Eleven, Phoenix)
        try {
          const poiLayers = ['poi-label', 'poi', 'transit-label', 'place-label']
          const availableLayers = poiLayers.filter((l) => map.getLayer(l)) as string[]
          const features = map.queryRenderedFeatures(e.point, { layers: availableLayers }) as unknown[]

          if (features && features.length > 0) {
            const poi = features[0] as {
              geometry?: { type?: string; coordinates?: [number, number] }
              text?: string
              properties?: { name?: string }
            }
            const coords: [number, number] = poi.geometry?.type === 'Point' && poi.geometry.coordinates
              ? poi.geometry.coordinates
              : [lng, lat]
            const name = poi.text || poi.properties?.name || 'Selected place'

            // Set marker exactly on the POI
            marker.setLngLat(coords as [number, number])

            // Derive a nicer address using reverse geocode for the POI coords
            const snappedAddress = await reverseGeocode(coords[1], coords[0])
            const display = snappedAddress?.includes('Lat:') ? name : `${name}, ${snappedAddress}`
            handleAddressSelectRef.current(display, { lat: coords[1], lng: coords[0] })
            return
          }
        } catch (err) {
          console.warn('POI snap failed, falling back to raw click:', err)
        }

        // Fallback: use raw click position
        const address = await reverseGeocode(lat, lng)
        handleAddressSelectRef.current(address, { lat, lng })
        marker.setLngLat([lng, lat])
      })

      // Handle marker drag end - debounce to prevent multiple updates and map refreshes
      let dragTimeout: ReturnType<typeof setTimeout> | null = null
      
      marker.on('dragend', async () => {
        // Clear any pending updates
        if (dragTimeout) {
          clearTimeout(dragTimeout)
          dragTimeout = null
        }
        
        // Debounce the reverse geocoding to prevent rapid API calls and map refreshes
        dragTimeout = setTimeout(async () => {
          const lngLat = marker.getLngLat()
          const { lng, lat } = lngLat

          // Use cached reverse geocoding
          const address = await reverseGeocode(lat, lng)
          handleAddressSelectRef.current(address, { lat, lng })
          
          dragTimeout = null
        }, MARKER_DRAG_DEBOUNCE_MS)
      })

      mapRef.current = map
    } catch (error) {
      console.error('Map initialization error:', error)
      setMapError('Failed to load map. Please check your Mapbox token.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]) // localValue and handleAddressSelect intentionally excluded to prevent re-initialization

  const handleMapSearch = useCallback((query: string) => {
    // Clear any pending search
    if (mapSearchDebounceRef.current) {
      clearTimeout(mapSearchDebounceRef.current)
    }

    if (!query.trim()) {
      setMapSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    // Debounce: Wait 500ms after user stops typing
    mapSearchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await suggestAddresses(
          query,
          accessTokenRef.current ?? '',
          getSessionToken(),
          { proximity: getSearchProximity() }
        )
        setMapSearchResults(results)
      } finally {
        setIsSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [getSearchProximity, getSessionToken])

  const handleSearchResultSelect = useCallback(async (result: SearchBoxSuggestion) => {
    // Clear search UI straight away so the pick feels immediate
    setMapSearchQuery('')
    setMapSearchResults([])

    // `suggest` returns no coordinates, so resolve them before moving the pin.
    const coordinates = await retrieveSuggestionCoordinates(
      result.mapbox_id,
      accessTokenRef.current ?? '',
      getSessionToken()
    )
    endSearchSession()

    if (!coordinates) {
      // Keep the chosen address; leaving the pin put is better than moving it wrongly.
      handleAddressSelectRef.current(result.place_name)
      return
    }

    const [lng, lat] = coordinates

    // Update address first (this updates the main input)
    handleAddressSelectRef.current(result.place_name, { lat, lng })
    
    // Center map on selected location and update marker
    if (mapRef.current) {
      // Wait for map to be fully loaded and ready
      const map = mapRef.current
      
      // Function to check if map is fully ready
      const checkMapReady = () => {
        try {
          const container = map.getContainer()
          const canvasContainer = map.getCanvasContainer()
          return (
            container &&
            canvasContainer &&
            container.parentElement &&
            container.isConnected &&
            canvasContainer.parentElement &&
            map.loaded() &&
            typeof container.appendChild === 'function'
          )
        } catch {
          return false
        }
      }
      
      // Wait for map to be ready with retries
      let attempts = 0
      const maxAttempts = 15
      
      // First ensure map is loaded
      if (!map.loaded()) {
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 3000)
          map.once('load', () => {
            clearTimeout(timeout)
            resolve(undefined)
          })
        })
      }
      
      // Then wait for map to be idle (fully rendered)
      await new Promise((resolve) => {
        if (map.loaded()) {
          // Wait for idle event which means map is fully rendered
          const timeout = setTimeout(resolve, 500)
          const onIdle = () => {
            clearTimeout(timeout)
            map.off('idle', onIdle)
            resolve(undefined)
          }
          map.once('idle', onIdle)
        } else {
          resolve(undefined)
        }
      })
      
      // Final check that container is ready
      while (!checkMapReady() && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 200))
        attempts++
      }
      
      // Final check - if still not ready, skip marker but update address
      if (!checkMapReady()) {
        console.warn('Map not fully ready after waiting, skipping marker but updating address')
        // Still fly to location even if we can't place marker
        try {
          map.flyTo({
            center: [lng, lat],
            zoom: 15,
            duration: 1000,
            essential: true,
          })
        } catch (error) {
          console.error('Error flying to location:', error)
        }
        return
      }
      
      const mapboxgl = (await import('mapbox-gl')).default
      
      // If marker doesn't exist yet (map just opened), create it
      if (!markerRef.current) {
        try {
          // Verify container one more time before adding
          const container = map.getContainer()
          const canvasContainer = map.getCanvasContainer()
          
          if (!container || !canvasContainer || !container.parentElement || !container.isConnected) {
            throw new Error('Map container not available or not in DOM')
          }
          
          // Verify container has the necessary DOM structure
          if (typeof container.appendChild !== 'function') {
            throw new Error('Container does not have appendChild method')
          }
          
          // Create popup
          const popup = new mapboxgl.Popup({ offset: 25, closeOnClick: false })
            .setText('Delivery Location')
          
          // Create marker - Mapbox will create the element internally
          markerRef.current = new mapboxgl.Marker({
            draggable: true,
            color: '#f97316'
          })
            .setLngLat([lng, lat])
            .setPopup(popup)
          
          // Add marker to map - ensure we have valid container
          if (canvasContainer && canvasContainer.parentElement) {
            markerRef.current.addTo(map)
          } else {
            throw new Error('Canvas container not ready')
          }
          
          // Open popup to make it visible
          markerRef.current.togglePopup()
          
          console.log('Created new marker at:', [lng, lat])
        } catch (error) {
          console.error('Error creating marker:', error)
          // Continue anyway, just update the map position
          try {
            map.flyTo({
              center: [lng, lat],
              zoom: 15,
              duration: 1000,
              essential: true,
            })
          } catch (flyError) {
            console.error('Error flying to location:', flyError)
          }
        }
      } else {
        // Marker exists, update position immediately before flying
        try {
          markerRef.current.setLngLat([lng, lat])
          
          // Update popup if it exists, or create one
          if (markerRef.current.getPopup()) {
            markerRef.current.getPopup()?.setText('Delivery Location')
          } else {
            const popup = new mapboxgl.Popup({ offset: 25, closeOnClick: false })
              .setText('Delivery Location')
            markerRef.current.setPopup(popup)
          }
          
          // Open popup to make it visible
          markerRef.current.togglePopup()
          
          console.log('Updated existing marker to:', [lng, lat])
        } catch (error) {
          console.error('Error updating marker:', error)
        }
      }
      
      // Fly to location
      try {
        map.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 1000,
          essential: true,
        })
        
        // Multiple strategies to ensure marker stays in place
        // Strategy 1: After fly animation
        const onMoveEnd = () => {
          if (mapRef.current && markerRef.current) {
            try {
              const currentPos = markerRef.current.getLngLat()
              console.log('Fly complete, ensuring marker at:', [lng, lat], 'Current marker:', [currentPos.lng, currentPos.lat])
              // Force marker to correct position
              markerRef.current.setLngLat([lng, lat])
              
              // Ensure popup is visible
              if (!markerRef.current.getPopup()?.isOpen()) {
                markerRef.current.togglePopup()
              }
              
              // Don't call resize during marker operations to prevent refresh
              mapRef.current.off('moveend', onMoveEnd)
            } catch (error) {
              console.error('Error in onMoveEnd:', error)
            }
          }
        }
        
        // Strategy 2: Set immediately after fly starts
        setTimeout(() => {
          if (mapRef.current && markerRef.current) {
            try {
              markerRef.current.setLngLat([lng, lat])
            } catch (error) {
              console.error('Error setting marker position:', error)
            }
          }
        }, 50)
        
        // Strategy 3: Set after animation completes
        setTimeout(() => {
          if (mapRef.current && markerRef.current) {
            try {
              markerRef.current.setLngLat([lng, lat])
              // Open popup if closed
              if (!markerRef.current.getPopup()?.isOpen()) {
                markerRef.current.togglePopup()
              }
              // Don't call resize to avoid map refresh
            } catch (error) {
              console.error('Error in final marker update:', error)
            }
          }
        }, 1100)
        
        map.once('moveend', onMoveEnd)
      } catch (error) {
        console.error('Error flying to location:', error)
      }
    }
  }, [getSessionToken, endSearchSession]) // handleAddressSelect stays behind a ref to avoid re-initialization

  useEffect(() => {
    if (showMapPicker && accessToken && isClient && !mapRef.current) {
      // Wait for dialog to be fully rendered before initializing map
      const timer = setTimeout(() => {
        initializeMap()
      }, 300)

      return () => {
        clearTimeout(timer)
      }
    } else if (!showMapPicker && mapRef.current) {
      // Cleanup when dialog closes
      try {
        mapRef.current.remove()
      } catch (error) {
        console.error('Error removing map:', error)
      }
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapPicker, accessToken, isClient]) // initializeMap intentionally excluded - only initialize once

  // Fallback to regular input if Mapbox is disabled, not configured, or not on client
  if (!mapboxEnabled || !isClient || !accessToken) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value)
              onChange(e.target.value)
            }}
            placeholder={placeholder}
            required={required}
            className={`pl-10 ${className} w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500`}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />
          <div className="relative">
            <input
              ref={inputRef}
              name="address"
              type="text"
              value={localValue}
              onChange={(e) => {
                const query = e.target.value
                setLocalValue(query)
                onChange(query)
                
                if (query.length > 2) {
                  handleMainSearch(query)
                } else {
                  setMainSearchResults([])
                  setShowMainSearchResults(false)
                }
              }}
              onFocus={() => {
                if (mainSearchResults.length > 0) {
                  setShowMainSearchResults(true)
                }
              }}
              onBlur={() => {
                // Delay hiding to allow click on results
                setTimeout(() => setShowMainSearchResults(false), 200)
              }}
              placeholder={placeholder}
              required={required}
              autoComplete="address-line1"
              className={`pl-10 ${className} w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500`}
            />
            
            {/* Main Search Results Dropdown */}
            {showMainSearchResults && mainSearchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {mainSearchResults.map((result) => (
                  <button
                    key={result.mapbox_id}
                    type="button"
                    onClick={() => {
                      handleMainSearchResultSelect(result)
                      setShowMainSearchResults(false)
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-gray-900">{result.place_name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleUseCurrentLocation(false)}
            disabled={isGettingLocation}
            title="Use current location"
            className="shrink-0"
          >
            <LocateFixed className={`h-4 w-4 ${isGettingLocation ? 'animate-pulse' : ''}`} />
          </Button>
          
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              setMapError(null)
              setMapSearchQuery('')
              setMapSearchResults([])
              setShowMapPicker(true)
            }}
            title="Pick on map"
            className="shrink-0"
          >
            <Map className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {mapError && (
        <p className="text-sm text-red-600">{mapError}</p>
      )}

      <Dialog open={showMapPicker} onOpenChange={setShowMapPicker}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Pick Your Location on the Map</DialogTitle>
            <DialogDescription>
              Search for a location or click on the map to set your delivery address. You can also drag the marker to adjust the location.
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-3 flex-1 overflow-y-auto min-h-0">
            {/* Map Search */}
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  ref={mapSearchInputRef}
                  type="text"
                  value={mapSearchQuery}
                  onChange={(e) => {
                    const query = e.target.value
                    setMapSearchQuery(query)
                    if (query.length > 2) {
                      handleMapSearch(query)
                    } else {
                      setMapSearchResults([])
                    }
                  }}
                  placeholder="Search for an address or place..."
                  className="pl-10"
                />
              
              {/* Search Results Dropdown */}
              {mapSearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {mapSearchResults.map((result) => (
                    <button
                      key={result.mapbox_id}
                      type="button"
                      onClick={() => handleSearchResultSelect(result)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                    >
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-900">{result.place_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              </div>
              
              {/* Use Current Location Button in Map Dialog */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleUseCurrentLocation(true)}
                disabled={isGettingLocation}
                title="Center map on current location"
                className="shrink-0"
              >
                <LocateFixed className={`h-4 w-4 ${isGettingLocation ? 'animate-pulse' : ''}`} />
              </Button>
            </div>
            
            {/* Map Container */}
            {mapError ? (
              <div className="w-full h-[500px] flex items-center justify-center border rounded-md bg-gray-50">
                <div className="text-center">
                  <p className="text-red-600 mb-2">{mapError}</p>
                  <Button onClick={initializeMap} variant="outline">
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div
                  ref={mapContainerRef}
                  className="w-full h-[500px] rounded-md overflow-hidden border bg-gray-100"
                  style={{ minHeight: '500px' }}
                />
                {isSearching && (
                  <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-md text-sm text-gray-600 flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
                    Searching...
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Buttons - positioned at bottom of modal */}
          <div className="mt-4 pt-4 border-t flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowMapPicker(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowMapPicker(false)}>
              Confirm Location
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}