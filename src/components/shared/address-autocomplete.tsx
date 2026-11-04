'use client'

import { MapboxAddressAutocomplete } from '@/components/shared/mapbox-address-autocomplete'
import { getMapsProvider } from '@/lib/maps/provider'
import { AppleAddressAutocomplete, type AddressChangeMeta } from './apple-maps/apple-address-autocomplete'
import type { PinCheckView, PinPurpose } from './apple-maps/pin-confirm-dialog'
import { PlainAddressInput } from './apple-maps/plain-address-input'

export type { AddressChangeMeta } from './apple-maps/apple-address-autocomplete'
export type { PinCheckView, PinPurpose } from './apple-maps/pin-confirm-dialog'

interface LatLngPoint {
  lat: number
  lng: number
}

export interface AddressAutocompleteProps {
  value: string
  onChange: (address: string, coordinates?: LatLngPoint, meta?: AddressChangeMeta) => void
  placeholder?: string
  required?: boolean
  className?: string
  /** The saved location, so the map opens on it (Apple Maps). */
  coordinates?: LatLngPoint | null
  /** The store's `mapbox_enabled` flag: false gives a plain text field on any provider. */
  mapsEnabled?: boolean
  /** Where search leans and the map opens before there is a pin: the branch or store. */
  biasCenter?: LatLngPoint | null
  /** A customer's door (default) or a store's entrance. */
  purpose?: PinPurpose
  /** Warnings about a confirmed spot (Apple Maps). */
  check?: (point: LatLngPoint) => PinCheckView | null
}

/**
 * Every address field in the app (checkout, store location, branches,
 * superadmin) goes through here, so the provider is chosen in one place.
 */
export function AddressAutocomplete({
  mapsEnabled = true,
  coordinates = null,
  biasCenter = null,
  purpose,
  check,
  ...props
}: AddressAutocompleteProps) {
  const mapbox = <MapboxAddressAutocomplete {...props} mapboxEnabled biasCenter={biasCenter} />
  if (getMapsProvider() === 'mapbox') {
    return <MapboxAddressAutocomplete {...props} mapboxEnabled={mapsEnabled} biasCenter={biasCenter} />
  }
  if (!mapsEnabled) return <PlainAddressInput {...props} onChange={(text) => props.onChange(text)} />

  return (
    <AppleAddressAutocomplete
      {...props}
      coordinates={coordinates}
      biasCenter={biasCenter}
      purpose={purpose}
      check={check}
      fallback={mapbox}
    />
  )
}
