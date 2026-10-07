'use client'

import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { getMapsProvider } from '@/lib/maps/provider'
import { AppleAddressAutocomplete } from './apple-maps/apple-address-autocomplete'
import { PlainAddressInput } from './apple-maps/plain-address-input'

export interface AddressAutocompleteProps {
  value: string
  onChange: (address: string, coordinates?: { lat: number; lng: number }) => void
  placeholder?: string
  required?: boolean
  className?: string
  /** The saved location, so the map opens on it (Apple Maps). */
  coordinates?: { lat: number; lng: number } | null
  /** The store's `mapbox_enabled` flag: false gives a plain text field on any provider. */
  mapsEnabled?: boolean
}

/**
 * Every address field in the app (checkout, store location, branches,
 * superadmin) goes through here, so the provider is chosen in one place.
 */
export function AddressAutocomplete({ mapsEnabled = true, coordinates = null, ...props }: AddressAutocompleteProps) {
  if (getMapsProvider() === 'mapbox') return <MapboxAddressAutocomplete {...props} mapboxEnabled={mapsEnabled} />
  if (!mapsEnabled) return <PlainAddressInput {...props} onChange={(text) => props.onChange(text)} />

  return (
    <AppleAddressAutocomplete
      {...props}
      coordinates={coordinates}
      fallback={<MapboxAddressAutocomplete {...props} mapboxEnabled />}
    />
  )
}
