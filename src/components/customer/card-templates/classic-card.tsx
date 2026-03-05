'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ClassicCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Classic Card Template
 * Traditional layout with image on top, content below
 */
export const ClassicCard = memo(function ClassicCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: ClassicCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-xl md:rounded-2xl shadow-sm transition-all hover:shadow-xl cursor-pointer"
      style={{
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {typeof item.image_url === 'string' && item.image_url.length > 0 && (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            loading="lazy"
          />
        )}

        {/* Overlay Elements */}
        {menuEngineeringEnabled && item.badge_text && (
          <div className="absolute left-2 top-2 md:left-3 md:top-3 z-10">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs font-bold shadow-sm"
              style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
            >
              {item.badge_text}
            </span>
          </div>
        )}

        {item.is_featured && !item.badge_text && (
          <div className="absolute left-2 top-2 md:left-3 md:top-3">
            <span className="text-xl">⭐</span>
          </div>
        )}

        {hasDiscount && (
          <div className="absolute right-2 top-2 md:right-3 md:top-3">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] md:px-2 md:py-1 md:text-xs font-bold"
              style={{ backgroundColor: branding.error, color: '#ffffff' }}
            >
              SALE
            </span>
          </div>
        )}

        {!item.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-gray-900">
              Unavailable
            </span>
          </div>
        )}

        {/* Add to Cart Button */}
        <button
          className="absolute bottom-2 right-2 md:bottom-3 md:right-3 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 hover:opacity-90"
          style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
          disabled={!item.is_available}
        >
          <span className="text-sm md:text-lg font-bold">+</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-2.5 md:p-4">
        <h3
          className="mb-1 text-sm md:text-lg font-bold line-clamp-1"
          style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>

        {item.description && (
          <p
            className="mb-2 text-xs md:text-sm line-clamp-1 md:line-clamp-2"
            style={{ color: branding.cardDescription }}
          >
            {item.description}
          </p>
        )}

        <div className="flex items-center gap-2">
          {hasDiscount && (
            <span
              className="text-sm line-through"
              style={{ color: branding.textMuted }}
            >
              {formatPrice(item.price, { hideCurrencySymbol })}
            </span>
          )}
          <span
            className="text-sm md:text-lg font-bold"
            style={{ color: branding.cardPrice }}
          >
            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
          </span>
        </div>

        {item.variations.length > 0 && (
          <div className="mt-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: branding.buttonSecondary,
                color: branding.buttonSecondaryText
              }}
            >
              {item.variations.length} sizes available
            </span>
          </div>
        )}
      </div>
    </div>
  )
})
