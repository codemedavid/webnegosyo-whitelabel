'use client'

import { CheckCircle2 } from 'lucide-react'
import type { OfferTheme } from './offer-theme'
import { OfferProductCard } from './offer-product-card'

export interface AddedSuggestion {
  id: string
  name: string
  priceLabel: string
  imageUrl?: string | null
}

export interface AddedSheetContentProps {
  addedName: string
  suggestions: readonly AddedSuggestion[]
  addedIds: ReadonlySet<string>
  theme: OfferTheme
  primaryLabel: string
  secondaryLabel: string
  onAdd: (id: string) => void
  onPrimary: () => void
  onSecondary: () => void
}

/**
 * The moment right after "Add to cart": confirm first, suggest second.
 * A half-height sheet the diner can dismiss with a glance, instead of the old
 * full-screen page that took over the product and hid the menu.
 */
export function AddedSheetContent({
  addedName,
  suggestions,
  addedIds,
  theme,
  primaryLabel,
  secondaryLabel,
  onAdd,
  onPrimary,
  onSecondary,
}: AddedSheetContentProps) {
  return (
    <div className="flex flex-col" style={{ color: theme.text }}>
      <div className="flex items-start gap-3 px-5 pt-5">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" style={{ color: theme.success }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug">Added to your order</p>
          <p className="truncate text-sm" style={{ color: theme.muted }}>{addedName}</p>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="pt-5">
          <p className="px-5 text-sm font-semibold">Goes well with it</p>
          <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-1 pt-3 [scrollbar-width:none]">
            {suggestions.map((suggestion) => (
              <OfferProductCard
                key={suggestion.id}
                name={suggestion.name}
                priceLabel={suggestion.priceLabel}
                imageUrl={suggestion.imageUrl}
                isAdded={addedIds.has(suggestion.id)}
                actionLabel={`Add ${suggestion.name}`}
                theme={theme}
                onAdd={() => onAdd(suggestion.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 px-5 pb-5 pt-5">
        <button
          type="button"
          onClick={onSecondary}
          className="h-12 flex-1 rounded-full border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ borderColor: theme.border, color: theme.text }}
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          className="h-12 flex-1 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}
