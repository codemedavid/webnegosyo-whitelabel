'use client'

import { MapPin } from 'lucide-react'

interface PlainAddressInputProps {
  value: string
  onChange: (address: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}

/** The address field with maps switched off or unavailable: free text, no coordinates. */
export function PlainAddressInput({ value, onChange, placeholder, required, className = '' }: PlainAddressInputProps) {
  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="address-line1"
        className={`pl-10 ${className} w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500`}
      />
    </div>
  )
}
