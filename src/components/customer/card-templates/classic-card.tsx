'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { hasDishPhoto } from '@/lib/dish-photo'
import { TextCardTags } from './text-card-tags'

interface ClassicCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  isOrderable: boolean
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
  priority?: boolean
}

/**
 * Classic Card Template
 * Traditional layout with image on top, content below. A dish without a photo
 * is a text card: a brand-colored top rule, then name, note and price.
 */
export const ClassicCard = memo(function ClassicCard({ item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority }: ClassicCardProps) {
  const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
  const displayPrice = hasDiscount ? item.discounted_price! : item.price
  const hasPhoto = hasDishPhoto(item)

  const addButton = (
    <button
      className={`${hasPhoto ? 'absolute bottom-2 right-2 md:bottom-3 md:right-3' : 'ml-auto shrink-0'} flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 hover:opacity-90`}
      style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(item)
      }}
      disabled={!isOrderable}
      aria-label={`Add ${item.name}`}
    >
      <span className="text-sm md:text-lg font-bold">+</span>
    </button>
  )

  return (
    <div
      className={`group relative overflow-hidden rounded-xl md:rounded-2xl shadow-sm transition-all hover:shadow-xl cursor-pointer ${hasPhoto ? '' : 'flex h-full flex-col'}`}
      style={{
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {hasPhoto ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <OptimizedImage
            src={item.image_url}
            fallbackSrc={branding.logoUrl}
            alt={item.name}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
          />

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

          {!isOrderable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-gray-900">
                Unavailable
              </span>
            </div>
          )}

          {addButton}
        </div>
      ) : (
        <div aria-hidden className="h-1 shrink-0" style={{ backgroundColor: branding.primary }} />
      )}

      {/* Content */}
      <div className={hasPhoto ? 'p-2.5 md:p-4' : 'flex flex-1 flex-col p-3 md:p-4'}>
        {!hasPhoto && (
          <TextCardTags
            item={item}
            branding={branding}
            isOrderable={isOrderable}
            hasDiscount={hasDiscount}
            menuEngineeringEnabled={menuEngineeringEnabled}
            soldOutLabel="Unavailable"
            className="mb-2"
          />
        )}

        <h3
          className={`mb-1 text-sm md:text-lg font-bold ${hasPhoto ? 'line-clamp-1' : 'line-clamp-2 leading-snug'}`}
          data-branding-scope="storefront/card-title" style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>

        {item.description && (
          <p
            className="mb-2 text-xs md:text-sm line-clamp-1 md:line-clamp-2"
            data-branding-scope="storefront/card-description" style={{ color: branding.cardDescription }}
          >
            {item.description}
          </p>
        )}

        <div className={`flex items-center gap-2 ${hasPhoto ? '' : 'mt-auto pt-1'}`}>
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
            data-branding-scope="storefront/card-price" style={{ color: branding.cardPrice }}
          >
            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
          </span>
          {!hasPhoto && addButton}
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
