'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, LocateFixed, Map, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const [mapSearchResults, setMapSearchResults] = useState<Array<{ place_name: string; coordinates: [number, number] }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [mainSearchResults, setMainSearchResults] = useState<Array<{ place_name: string; coordinates: [number, number] }>>([])
  const [showMainSearchResults, setShowMainSearchResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapSearchInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  
  // Cache for reverse geocoding results to avoid redundant API calls
  // Key: "lat_lng" (rounded to 4 decimal places), Value: address string
  const geocodeCacheRef = useRef<Record<string, string>>({})

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

  const handleAddressSelect = useCallback((address: string, coordinates?: { lat: number; lng: number }) => {
    setLocalValue(address)
    onChange(address, coordinates)
  }, [onChange])

  // Handle main search box autocomplete
  const handleMainSearch = useCallback(async (query: string) => {
    if (!accessToken || !query.trim()) {
      setMainSearchResults([])
      setShowMainSearchResults(false)
      return
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}&country=PH&limit=5&types=address,poi`
      )
      const data = await response.json()
      
      if (data.features && data.features.length > 0) {
        setMainSearchResults(
          data.features.map((feature: { place_name: string; geometry: { coordinates: [number, number] } }) => ({
            place_name: feature.place_name,
            coordinates: feature.geometry.coordinates,
          }))
        )
        setShowMainSearchResults(true)
      } else {
        setMainSearchResults([])
        setShowMainSearchResults(false)
      }
    } catch (error) {
      console.error('Main search error:', error)
      setMainSearchResults([])
      setShowMainSearchResults(false)
    }
  }, [accessToken])

  const handleMainSearchResultSelect = useCallback((result: { place_name: string; coordinates: [number, number] }) => {
    const [lng, lat] = result.coordinates
    handleAddressSelect(result.place_name, { lat, lng })
    setMainSearchResults([])
    setShowMainSearchResults(false)
  }, [handleAddressSelect])

  // Use ref to store the latest handleAddressSelect to avoid dependency issues
  const handleAddressSelectRef = useRef(handleAddressSelect)
  useEffect(() => {
    handleAddressSelectRef.current = handleAddressSelect
  }, [handleAddressSelect])

  // Helper function to round coordinates for cache key (4 decimal places = ~11m precision)
  const getCacheKey = useCallback((lat: number, lng: number): string => {
    return `${lat.toFixed(4)}_${lng.toFixed(4)}`
  }, [])

  // Cached reverse geocoding function
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    // Check cache first
    const cacheKey = getCacheKey(lat, lng)
    const cached = geocodeCacheRef.current[cacheKey]
    if (cached) {
      console.log('Using cached geocode for', cacheKey)
      return cached
    }

    // If not in cache, make API call
    if (!accessToken) {
      const fallback = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`
      geocodeCacheRef.current[cacheKey] = fallback
      return fallback
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${accessToken}&limit=1`
      )
      const data = await response.json()
      
      let address: string
      if (data.features && data.features.length > 0) {
        address = data.features[0].place_name || data.features[0].text
      } else {
        address = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`
      }
      
      // Store in cache
      geocodeCacheRef.current[cacheKey] = address
      console.log('Cached new geocode for', cacheKey, ':', address)
      
      return address
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      const fallback = `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`
      // Cache the fallback too
      geocodeCacheRef.current[cacheKey] = fallback
      return fallback
    }
  }, [accessToken, getCacheKey])

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
      let initialLng = 120.9842
      let initialLat = 14.5995

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
        zoom: 13,
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

      // Handle map click
      map.on('click', async (e) => {
        const { lng, lat } = e.lngLat
        
        // Reverse geocode using cache
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
        }, 500) // 500ms debounce to prevent rapid updates and map refreshes
      })

      mapRef.current = map
    } catch (error) {
      console.error('Map initialization error:', error)
      setMapError('Failed to load map. Please check your Mapbox token.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]) // localValue and handleAddressSelect intentionally excluded to prevent re-initialization

  const handleMapSearch = useCallback(async (query: string) => {
    if (!accessToken || !query.trim()) {
      setMapSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${accessToken}&country=PH&limit=5`
      )
      const data = await response.json()
      
      if (data.features && data.features.length > 0) {
        setMapSearchResults(
          data.features.map((feature: { place_name: string; geometry: { coordinates: [number, number] } }) => ({
            place_name: feature.place_name,
            coordinates: feature.geometry.coordinates,
          }))
        )
      } else {
        setMapSearchResults([])
      }
    } catch (error) {
      console.error('Map search error:', error)
      setMapSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [accessToken])

  const handleSearchResultSelect = useCallback(async (result: { place_name: string; coordinates: [number, number] }) => {
    const [lng, lat] = result.coordinates
    
    console.log('Search result selected:', result, 'Coordinates:', { lng, lat })
    
    // Update address first (this updates the main input)
    handleAddressSelectRef.current(result.place_name, { lat, lng })
    
    // Clear search UI
    setMapSearchQuery('')
    setMapSearchResults([])
    
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
  }, []) // No dependencies needed - uses ref for handleAddressSelect to avoid re-initialization

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
                {mainSearchResults.map((result, index) => (
                  <button
                    key={index}
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
                  {mapSearchResults.map((result, index) => (
                    <button
                      key={index}
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