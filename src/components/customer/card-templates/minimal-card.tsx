'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { hasDishPhoto } from '@/lib/dish-photo'
import { TextCardTags } from './text-card-tags'

interface MinimalCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  isOrderable: boolean
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  priority?: boolean
}

/**
 * Minimal Card Template
 * Ultra-clean design with subtle borders and minimal decoration. A dish
 * without a photo is the same card minus the photo: centered text, tags on top.
 */
export const MinimalCard = memo(function MinimalCard({ item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority }: MinimalCardProps) {
  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  const displayPrice = hasDiscount ? item.discounted_price! : item.price
  const hasPhoto = hasDishPhoto(item)

  return (
    <div
      className={`group relative overflow-hidden rounded-lg transition-all hover:shadow-md cursor-pointer ${hasPhoto ? '' : 'flex h-full flex-col'}`}
      style={{
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      {hasPhoto && (
        <div className="relative aspect-square overflow-hidden bg-muted">
          <OptimizedImage
            src={item.image_url}
            fallbackSrc={branding.logoUrl}
            alt={item.name}
            fill
            className="object-cover transition-opacity group-hover:opacity-90"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
          />

          {/* Badges - Minimal style */}
          {menuEngineeringEnabled && item.badge_text && (
            <div className="absolute left-2 top-2 z-10">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
              >
                {item.badge_text}
              </span>
            </div>
          )}

          {item.is_featured && !item.badge_text && (
            <div className="absolute left-2 top-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: branding.warning }}
              />
            </div>
          )}

          {hasDiscount && (
            <div className="absolute right-2 top-2">
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: branding.error,
                  color: '#ffffff'
                }}
              >
                SALE
              </span>
            </div>
          )}

          {!isOrderable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <span
                className="text-xs font-medium px-2 py-1 rounded"
                style={{ backgroundColor: branding.cards }}
              >
                Unavailable
              </span>
            </div>
          )}
        </div>
      )}

      {/* Content - Centered and minimal */}
      <div className={`text-center space-y-1 md:space-y-2 ${hasPhoto ? 'p-2 md:p-3' : 'flex flex-1 flex-col p-3 md:p-4'}`}>
        {!hasPhoto && (
          <TextCardTags
            item={item}
            branding={branding}
            isOrderable={isOrderable}
            hasDiscount={Boolean(hasDiscount)}
            menuEngineeringEnabled={menuEngineeringEnabled}
            soldOutLabel="Unavailable"
            className="justify-center"
            tagClassName="rounded px-1.5 py-0.5 text-[10px] font-medium"
          />
        )}
        <h3
          className={`text-xs md:text-sm font-semibold ${hasPhoto ? 'line-clamp-1' : 'line-clamp-2'}`}
          data-branding-scope="storefront/card-title" style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>

        {item.description && (
          <p
            className="text-[11px] md:text-xs line-clamp-1 md:line-clamp-2"
            data-branding-scope="storefront/card-description" style={{ color: branding.cardDescription }}
          >
            {item.description}
          </p>
        )}

        <div className={`flex items-center justify-center gap-1.5 ${hasPhoto ? '' : 'mt-auto'}`}>
          {hasDiscount && (
            <span
              className="text-xs line-through"
              style={{ color: branding.textMuted }}
            >
              {formatPrice(item.price, { hideCurrencySymbol })}
            </span>
          )}
          <span
            className="text-sm md:text-base font-bold"
            data-branding-scope="storefront/card-price" style={{ color: branding.cardPrice }}
          >
            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
          </span>
        </div>

        {/* Simple add button */}
        <button
          className="w-full py-1 md:py-1.5 text-[11px] md:text-xs font-medium rounded transition-colors"
          style={{
            backgroundColor: branding.buttonPrimary,
            color: branding.buttonPrimaryText
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
          disabled={!isOrderable}
          aria-label={`Add ${item.name}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  )
})
