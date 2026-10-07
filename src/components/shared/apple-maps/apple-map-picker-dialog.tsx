'use client'

import { useId, useState } from 'react'
import { LocateFixed, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { LatLng } from '@/lib/maps/apple/mapkit-address'
import { AddressSuggestionList, suggestionOptionId, useSuggestionKeyboard } from './address-suggestion-list'
import { AppleMapCanvas } from './apple-map-canvas'
import { useAddressSuggestions, type AddressSuggestion } from './use-apple-address-search'

interface AppleMapPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null until a location is chosen. */
  pin: LatLng | null
  /** Where the map opens, and searches lean, before there is a pin. */
  initialCenter: LatLng
  isLocating: boolean
  /** The pin moved on the map; the field reverse-geocodes and stores it. */
  onMapPick: (point: LatLng, placeName: string | null) => void
  onSuggestionPick: (suggestion: AddressSuggestion) => void
  onLocate: () => void
  suggest: (query: string, near: LatLng) => Promise<AddressSuggestion[]>
}

export function AppleMapPickerDialog({
  open,
  onOpenChange,
  pin,
  initialCenter,
  isLocating,
  onMapPick,
  onSuggestionPick,
  onLocate,
  suggest,
}: AppleMapPickerDialogProps) {
  const [query, setQuery] = useState('')
  const { suggestions, search, clear: clearSuggestions } = useAddressSuggestions(suggest)
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapAttempt, setMapAttempt] = useState(0)
  const listId = useId()

  const handleQueryChange = (next: string) => {
    setQuery(next)
    search(next, pin ?? initialCenter)
  }

  const handleSuggestionPick = (suggestion: AddressSuggestion) => {
    setQuery('')
    clearSuggestions()
    onSuggestionPick(suggestion)
  }

  const { activeIndex, onKeyDown } = useSuggestionKeyboard(suggestions, handleSuggestionPick, clearSuggestions)

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('')
      clearSuggestions()
      setMapError(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] flex-col sm:max-w-3xl"
        // Escape with suggestions showing closes the list, not the whole picker.
        onEscapeKeyDown={(event) => {
          if (suggestions.length === 0) return
          event.preventDefault()
          clearSuggestions()
        }}
      >
        <DialogHeader>
          <DialogTitle>Pick your location on the map</DialogTitle>
          <DialogDescription>
            Search for a place, tap the map, or drag the pin to the exact spot.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                role="combobox"
                aria-label="Search for an address or place"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls={listId}
                aria-activedescendant={activeIndex >= 0 ? suggestionOptionId(listId, activeIndex) : undefined}
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search for an address or place..."
                className="pl-10"
              />
              <AddressSuggestionList
                id={listId}
                suggestions={suggestions}
                activeIndex={activeIndex}
                onSelect={handleSuggestionPick}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onLocate}
              disabled={isLocating}
              title="Center the map on my location"
              aria-label="Center the map on my location"
              className="shrink-0"
            >
              <LocateFixed className={`h-4 w-4 ${isLocating ? 'animate-pulse' : ''}`} />
            </Button>
          </div>

          {mapError ? (
            <div className="flex h-[60vh] min-h-[360px] w-full items-center justify-center rounded-md border bg-gray-50">
              <div className="text-center">
                <p className="mb-2 text-red-600">{mapError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMapError(null)
                    setMapAttempt((attempt) => attempt + 1)
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          ) : open ? (
            <AppleMapCanvas key={mapAttempt} pin={pin} initialCenter={initialCenter} onPick={onMapPick} onError={setMapError} />
          ) : null}
        </div>

        {/* Every pick applies the moment it is made, so there is nothing to
            cancel: one button closes the picker on the chosen spot. */}
        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t pt-4">
          <Button type="button" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
