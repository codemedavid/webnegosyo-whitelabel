'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ModernCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Modern Card Template
 * Contemporary design with overlapping elements and bold typography
 */
export const ModernCard = memo(function ModernCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: ModernCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-2xl md:rounded-3xl shadow-md transition-all hover:shadow-2xl cursor-pointer"
      style={{
        backgroundColor: branding.cards,
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container with gradient overlay */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {typeof item.image_url === 'string' && item.image_url ? (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform group-hover:scale-110"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: branding.border }}>
            <svg className="h-12 w-12 opacity-40" fill="currentColor" viewBox="0 0 24 24" style={{ color: branding.textMuted }}>
              <path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
            </svg>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Custom Badge */}
        {menuEngineeringEnabled && item.badge_text && (
          <div className="absolute top-2 left-2 md:top-3 md:left-3 z-10">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] md:px-2.5 md:py-1 md:text-xs font-bold backdrop-blur-md shadow-sm"
              style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
            >
              {item.badge_text}
            </span>
          </div>
        )}

        {/* Badges - Top corners */}
        <div className="absolute top-2 left-2 right-2 md:top-3 md:left-3 md:right-3 flex justify-between items-start">
          {item.is_featured && !item.badge_text && (
            <div
              className="px-2 py-1 rounded-full text-xs font-bold backdrop-blur-md"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: branding.primary
              }}
            >
              ⭐ Featured
            </div>
          )}
          {hasDiscount && (
            <div
              className="px-2 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: branding.error,
                color: '#ffffff'
              }}
            >
              SALE
            </div>
          )}
        </div>

        {!item.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900">
              Unavailable
            </span>
          </div>
        )}

        {/* Floating price tag - bottom left */}
        <div
          className="absolute bottom-2 left-2 md:bottom-4 md:left-4 rounded-xl px-2 py-1 md:px-3 md:py-2 backdrop-blur-md"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
        >
          <div className="flex items-center gap-2">
            {hasDiscount && (
              <span
                className="text-xs line-through"
                style={{ color: branding.textMuted }}
              >
                {formatPrice(item.price, { hideCurrencySymbol })}
              </span>
            )}
            <span
              className="text-sm md:text-xl font-black"
              style={{ color: branding.cardPrice }}
            >
              {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
            </span>
          </div>
        </div>

        {/* Floating Add Button - bottom right */}
        <button
          className="absolute bottom-2 right-2 md:bottom-4 md:right-4 flex h-9 w-9 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl shadow-2xl transition-all hover:scale-110"
          style={{
            backgroundColor: branding.buttonPrimary,
            color: branding.buttonPrimaryText
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
          disabled={!item.is_available}
        >
          <svg
            className="h-4 w-4 md:h-6 md:w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Content - Overlapping the image */}
      <div className="relative -mt-4 mx-2 mb-2 md:-mt-6 md:mx-4 md:mb-4 rounded-xl md:rounded-2xl p-2.5 md:p-4 backdrop-blur-md"
        style={{
          backgroundColor: branding.cards,
          borderColor: branding.cardsBorder,
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <h3
          className="text-sm md:text-base font-black line-clamp-1"
          style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>

        {item.description && (
          <p
            className="mt-1 text-[11px] md:text-xs line-clamp-1 md:line-clamp-2"
            style={{ color: branding.cardDescription }}
          >
            {item.description}
          </p>
        )}

        {item.variations.length > 0 && (
          <div className="mt-1">
            <span
              className="text-xs font-medium"
              style={{ color: branding.textSecondary }}
            >
              {item.variations.length} options available
            </span>
          </div>
        )}
      </div>
    </div>
  )
})
