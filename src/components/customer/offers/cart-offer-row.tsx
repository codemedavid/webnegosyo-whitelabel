'use client'

import type { OfferTheme } from './offer-theme'
import { OfferProductCard } from './offer-product-card'

export interface CartOfferItem {
  id: string
  name: string
  priceLabel: string
  imageUrl?: string | null
}

export interface CartOfferRowProps {
  title: string
  subtitle?: string
  items: readonly CartOfferItem[]
  addedIds: ReadonlySet<string>
  theme: OfferTheme
  onAdd: (id: string) => void
}

/**
 * The cart's last call: a row inside the cart, not a gate in front of
 * checkout. Every diner used to pay one extra full-screen step on the way to
 * paying; now the offer sits where they are already reviewing the order.
 */
export function CartOfferRow({ title, subtitle, items, addedIds, theme, onAdd }: CartOfferRowProps) {
  if (items.length === 0) return null
  return (
    <section
      aria-label={title}
      className="rounded-2xl border py-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
    >
      <div className="px-4">
        <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: theme.muted }}>{subtitle}</p>}
      </div>
      {/* contain: the cards must not set the cart column's min width — on a
          phone they widened the whole cart page past the screen. */}
      <div className="flex snap-x gap-3 overflow-x-auto px-4 pt-3 [scrollbar-width:none]" style={{ contain: 'inline-size' }}>
        {items.map((item) => (
          <OfferProductCard
            key={item.id}
            name={item.name}
            priceLabel={item.priceLabel}
            imageUrl={item.imageUrl}
            isAdded={addedIds.has(item.id)}
            actionLabel={`Add ${item.name}`}
            theme={theme}
            size="compact"
            onAdd={() => onAdd(item.id)}
          />
        ))}
      </div>
    </section>
  )
}
