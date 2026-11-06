'use client'

import { MapPin, X } from 'lucide-react'
import type { SavedAddress } from '@/lib/checkout/saved-addresses'
import { STANDARD_INPUT_CLASS } from './field-styles'

interface SavedAddressListProps {
  addresses: readonly SavedAddress[]
  onUse: (address: SavedAddress) => void
  onForget: (address: SavedAddress) => void
  linkClassName: string
  mutedClassName: string
}

/** The addresses this device delivered to before: one tap, no map. */
export function SavedAddressList({ addresses, onUse, onForget, linkClassName, mutedClassName }: SavedAddressListProps) {
  if (addresses.length === 0) return null
  return (
    <section aria-label="Your saved addresses" className="space-y-1.5">
      <p data-part="muted" className={`text-sm ${mutedClassName}`}>Deliver to a saved address</p>
      {addresses.map((address) => (
        <div key={`${address.address}:${address.lat}:${address.lng}`} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onUse(address)}
            data-part="button-alt"
            className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm ${STANDARD_INPUT_CLASS} ${linkClassName}`}
          >
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{address.unit ? `${address.unit}, ${address.address}` : address.address}</span>
          </button>
          <button
            type="button"
            onClick={() => onForget(address)}
            aria-label={`Forget ${address.address}`}
            className={`flex h-11 w-11 shrink-0 items-center justify-center ${mutedClassName}`}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  )
}
