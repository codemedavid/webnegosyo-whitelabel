'use client'

import { MapPin } from 'lucide-react'
import type { AddressSuggestion } from './use-apple-address-search'

interface AddressSuggestionListProps {
  suggestions: AddressSuggestion[]
  onSelect: (suggestion: AddressSuggestion) => void
}

export function AddressSuggestionList({ suggestions, onSelect }: AddressSuggestionListProps) {
  if (suggestions.length === 0) return null

  return (
    <div
      role="listbox"
      className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.key}
          type="button"
          role="option"
          aria-selected={false}
          // mousedown, not click: the input's blur would otherwise close the list first.
          onMouseDown={(event) => {
            event.preventDefault()
            onSelect(suggestion)
          }}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
        >
          <span className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span className="text-sm text-gray-900">{suggestion.label}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
