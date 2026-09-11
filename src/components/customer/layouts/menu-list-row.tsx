'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import type { BrandingColors } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

interface MenuListRowProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  formatPrice: (value: number) => string
  menuEngineeringEnabled?: boolean
}

/**
 * The list layout's compact row — a fourteenth card surface.
 *
 * It is not a registered card template (the list look is the point: a dense
 * row, not a card), but it answers to the same contract every template does,
 * which is why it lives in its own file with its own tests instead of inline
 * in `layout-list`. Inline, it silently skipped `isMenuItemOrderable` and
 * `badge_text` entirely: an out-of-stock dish rendered a live "+" here while
 * every other layout greyed it out.
 */
export const MenuListRow = memo(function MenuListRow({
  item,
  onSelect,
  branding,
  formatPrice,
  menuEngineeringEnabled,
}: MenuListRowProps) {
  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  const displayPrice = hasDiscount ? item.discounted_price! : item.price
  const isOrderable = isMenuItemOrderable(item)
  const isStar = menuEngineeringEnabled && item.bcg_classification === 'star'
  const badgeText = menuEngineeringEnabled ? item.badge_text : null

  return (
    <button
      onClick={() => onSelect(item)}
      className="flex items-center gap-4 py-3 w-full text-left group transition-colors hover:bg-black/[0.02] rounded-lg px-2 -mx-2"
    >
      {/* Thumbnail */}
      <div
        className="relative h-14 w-14 md:h-16 md:w-16 rounded-xl overflow-hidden shrink-0"
        style={{ backgroundColor: branding.cards }}
      >
        {item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className={`object-cover${isOrderable ? '' : ' opacity-40'}`}
            sizes="64px"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-lg opacity-30">🍽️</div>
        )}
      </div>

      {/* Info */}
      <div className={`flex-1 min-w-0${isOrderable ? '' : ' opacity-60'}`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate" style={{ color: branding.cardTitle }}>
            {item.name}
          </h3>
          {isStar && <span className="text-xs">⭐</span>}
          {badgeText && (
            <span
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${branding.primary}15`, color: branding.primary }}
            >
              {badgeText}
            </span>
          )}
          {item.is_featured && (
            <span
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${branding.primary}15`, color: branding.primary }}
            >
              Featured
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: branding.cardDescription }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Price + Add */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`text-right${isOrderable ? '' : ' opacity-60'}`}>
          <span className="text-sm font-semibold" style={{ color: branding.cardPrice }}>
            {formatPrice(displayPrice)}
          </span>
          {hasDiscount && (
            <span className="text-[10px] line-through block" style={{ color: branding.textMuted }}>
              {formatPrice(item.price)}
            </span>
          )}
        </div>
        {/*
          The row itself stays tappable when the dish is out of stock — the same
          as every card template, where the card opens and only the "+" refuses
          — so the customer can read why. The add affordance is what disappears.
        */}
        {isOrderable ? (
          <div
            aria-label={`Add ${item.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-transform group-hover:scale-110"
            style={{ backgroundColor: branding.primary, color: '#fff' }}
          >
            +
          </div>
        ) : (
          <span
            className="rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap"
            style={{ backgroundColor: `${branding.textMuted}20`, color: branding.textMuted }}
          >
            Unavailable
          </span>
        )}
      </div>
    </button>
  )
})
