'use client'

import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { AddressSelection, LatLng } from '@/lib/maps/apple/mapkit-address'
import { readPastedLocation, UNREADABLE_LINK_MESSAGE } from '@/lib/maps/read-pasted-location'
import { AddressSuggestionList, suggestionOptionId, useSuggestionKeyboard } from './address-suggestion-list'
import { useAddressSuggestions, type AddressSuggestion } from './use-apple-address-search'

const LIST_ID = 'pin-map-search-list'

/** A place found with the search on the map. `label` is null for a pasted spot, which has no name. */
export interface PinMapPlace {
  point: LatLng
  label: string | null
  source: 'search' | 'link'
}

export interface PinMapSearchProps {
  suggest: (query: string, near: LatLng) => Promise<AddressSuggestion[]>
  resolveSuggestion: (suggestion: AddressSuggestion) => Promise<AddressSelection | null>
  /** Where search leans: what the map is looking at. */
  near: LatLng
  onPlace: (place: PinMapPlace) => void
}

/**
 * Search from inside the map: move it to a place without closing the map and
 * starting over. Takes a pasted map link or coordinates too.
 */
export function PinMapSearch({ suggest, resolveSuggestion, near, onPlace }: PinMapSearchProps) {
  const { suggestions, search, clear } = useAddressSuggestions(suggest)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Bumped per keystroke: a short link's answer arrives late, and must not undo newer typing. */
  const editGenerationRef = useRef(0)

  const handleType = (next: string) => {
    setText(next)
    setError(null)
    editGenerationRef.current += 1
    const generation = editGenerationRef.current
    void readPastedLocation(next).then((pasted) => {
      if (generation !== editGenerationRef.current) return
      if (!pasted) {
        search(next, near)
        return
      }
      clear()
      if (pasted.kind === 'point') {
        setText('')
        onPlace({ point: pasted.point, label: null, source: 'link' })
      } else if (pasted.kind === 'query') {
        setText(pasted.query)
        search(pasted.query, near)
      } else {
        setError(UNREADABLE_LINK_MESSAGE)
      }
    })
  }

  const handleSelect = async (suggestion: AddressSuggestion) => {
    clear()
    setText(suggestion.label)
    const selection = await resolveSuggestion(suggestion)
    if (selection) onPlace({ point: selection.coordinates, label: selection.address, source: 'search' })
    else setError('We could not open that place. Try another, or move the map yourself.')
  }

  const { activeIndex, onKeyDown } = useSuggestionKeyboard(suggestions, handleSelect, clear)
  const isOpen = suggestions.length > 0

  return (
    <div className="relative shrink-0">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 z-10 h-4 w-4 text-gray-400" />
      <input
        type="text"
        role="combobox"
        aria-label="Search on the map"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={LIST_ID}
        aria-activedescendant={isOpen && activeIndex >= 0 ? suggestionOptionId(LIST_ID, activeIndex) : undefined}
        value={text}
        onChange={(event) => handleType(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search a street, place or paste a map link"
        className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm"
      />
      {isOpen ? <AddressSuggestionList id={LIST_ID} suggestions={suggestions} activeIndex={activeIndex} onSelect={handleSelect} /> : null}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
