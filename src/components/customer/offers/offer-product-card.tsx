'use client'

import { Check, Plus } from 'lucide-react'
import type { OfferTheme } from './offer-theme'

export interface OfferProductCardProps {
  name: string
  priceLabel: string
  imageUrl?: string | null
  isAdded?: boolean
  /** Label for screen readers and the tap target, e.g. "Add Fries". */
  actionLabel: string
  theme: OfferTheme
  size?: 'regular' | 'compact'
  onAdd: () => void
}

/**
 * One suggested dish with a single, obvious action. Tapping anywhere on the
 * card adds it — the old cards hid a stepper and a "Customize & Add" button
 * that did nothing at checkout.
 */
export function OfferProductCard({
  name,
  priceLabel,
  imageUrl,
  isAdded = false,
  actionLabel,
  theme,
  size = 'regular',
  onAdd,
}: OfferProductCardProps) {
  const isCompact = size === 'compact'
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={isAdded ? `${name} added` : actionLabel}
      className={`group shrink-0 snap-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        isCompact ? 'w-[112px]' : 'w-[136px]'
      }`}
    >
      <span
        className="relative block aspect-square w-full overflow-hidden rounded-2xl transition-transform group-active:scale-[0.97]"
        style={{ backgroundColor: theme.border }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
        <span
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-colors"
          style={
            isAdded
              ? { backgroundColor: theme.success, color: '#ffffff' }
              : { backgroundColor: theme.accent, color: theme.accentText }
          }
          aria-hidden="true"
        >
          {isAdded ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
        </span>
      </span>
      <span className="mt-2 line-clamp-2 block text-[13px] font-medium leading-snug" style={{ color: theme.text }}>
        {name}
      </span>
      <span className="block text-[13px] font-semibold" style={{ color: isAdded ? theme.success : theme.muted }}>
        {isAdded ? 'Added' : priceLabel}
      </span>
    </button>
  )
}
