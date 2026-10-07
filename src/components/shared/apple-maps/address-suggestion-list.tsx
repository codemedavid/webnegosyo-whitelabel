'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import { MapPin } from 'lucide-react'
import type { AddressSuggestion } from './use-apple-address-search'

interface AddressSuggestionListProps {
  /** DOM id of the listbox; the combobox input points at it. */
  id: string
  suggestions: AddressSuggestion[]
  /** Index of the keyboard-highlighted option, or -1. */
  activeIndex: number
  onSelect: (suggestion: AddressSuggestion) => void
}

export function suggestionOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`
}

interface ActiveState {
  list: AddressSuggestion[]
  index: number
}

/**
 * Arrow keys / Enter / Escape for a suggestion combobox. The highlight belongs
 * to one list of suggestions: a new list starts with nothing highlighted.
 */
export function useSuggestionKeyboard(
  suggestions: AddressSuggestion[],
  onSelect: (suggestion: AddressSuggestion) => void,
  onDismiss: () => void,
) {
  const [active, setActive] = useState<ActiveState>({ list: suggestions, index: -1 })
  const activeIndex = active.list === suggestions ? active.index : -1

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return
    const last = suggestions.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive({ list: suggestions, index: activeIndex >= last ? 0 : activeIndex + 1 })
        return
      case 'ArrowUp':
        event.preventDefault()
        setActive({ list: suggestions, index: activeIndex <= 0 ? last : activeIndex - 1 })
        return
      case 'Enter':
        // Only a highlighted pick is taken over; otherwise Enter keeps its form meaning.
        if (activeIndex < 0) return
        event.preventDefault()
        onSelect(suggestions[activeIndex])
        return
      case 'Escape':
        event.preventDefault()
        onDismiss()
        return
    }
  }

  return { activeIndex, onKeyDown }
}

export function AddressSuggestionList({ id, suggestions, activeIndex, onSelect }: AddressSuggestionListProps) {
  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (activeIndex < 0) return
    document.getElementById(suggestionOptionId(id, activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [id, activeIndex])

  if (suggestions.length === 0) return null

  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Address suggestions"
      className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
    >
      {suggestions.map((suggestion, index) => {
        const isActive = index === activeIndex
        return (
          <li
            key={suggestion.key}
            id={suggestionOptionId(id, index)}
            role="option"
            aria-selected={isActive}
            // mousedown, not click: the input's blur would otherwise close the list first.
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(suggestion)
            }}
            className={`flex cursor-pointer items-start gap-2 px-4 py-2 text-left hover:bg-gray-50 ${isActive ? 'bg-gray-100' : ''}`}
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <span className="text-sm text-gray-900">{suggestion.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
