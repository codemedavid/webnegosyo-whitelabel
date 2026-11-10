'use client'

import { MapPin } from 'lucide-react'

import { addressFieldPart, type AddressFieldTheme } from '../address-field-theme'

interface PlainAddressInputProps {
  value: string
  onChange: (address: string) => void
  placeholder?: string
  required?: boolean
  className?: string
  /** Themed page colours (the checkout); absent = the standard gray field. */
  theme?: AddressFieldTheme
}

/** The address field with maps switched off or unavailable: free text, no coordinates. */
export function PlainAddressInput({ value, onChange, placeholder, required, className = '', theme }: PlainAddressInputProps) {
  return (
    <div className="relative">
      <MapPin className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme?.icon ?? 'text-gray-400'}`} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="address-line1"
        data-part={addressFieldPart(theme, 'field')}
        className={`pl-10 ${className} ${theme?.input ?? 'w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500'}`}
      />
    </div>
  )
}
