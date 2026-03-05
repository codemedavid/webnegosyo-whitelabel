'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ElegantCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Elegant Card Template
 * Sophisticated design with soft shadows and refined spacing
 */
export const ElegantCard = memo(function ElegantCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: ElegantCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-[20px] transition-all cursor-pointer"
      style={{
        backgroundColor: branding.cards,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)'
        e.currentTarget.style.transform = 'translateY(-4px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {typeof item.image_url === 'string' && item.image_url.length > 0 && (
          <OptimizedImage
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-all duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            loading="lazy"
          />
        )}

        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/10" />

        {/* Custom Badge */}
        {menuEngineeringEnabled && item.badge_text && (
          <div className="absolute left-2 top-2 md:left-4 md:top-4 z-10">
            <div
              className="px-2 py-1 md:px-3 md:py-1.5 rounded-full text-[10px] md:text-xs font-semibold backdrop-blur-xl"
              style={{
                backgroundColor: branding.primary,
                color: branding.buttonPrimaryText || '#ffffff',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}
            >
              {item.badge_text}
            </div>
          </div>
        )}

        {/* Badges - Elegant styling */}
        {item.is_featured && !item.badge_text && (
          <div className="absolute left-2 top-2 md:left-4 md:top-4">
            <div
              className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                color: branding.primary,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }}
            >
              ⭐ Featured
            </div>
          </div>
        )}

        {hasDiscount && (
          <div className="absolute right-2 top-2 md:right-4 md:top-4">
            <div
              className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl"
              style={{
                backgroundColor: branding.error,
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
            >
              SALE
            </div>
          </div>
        )}

        {!item.is_available && (
          <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-white/30">
            <div
              className="rounded-2xl px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: branding.cards,
                color: branding.textPrimary,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
              }}
            >
              Unavailable
            </div>
          </div>
        )}
      </div>

      {/* Content - Premium spacing */}
      <div className="p-3 space-y-1.5 md:p-5 md:space-y-3">
        <div>
          <h3
            className="text-sm md:text-lg font-semibold line-clamp-1 mb-1"
            style={{ color: branding.cardTitle }}
          >
            {item.name}
          </h3>

          {item.description && (
            <p
              className="text-xs md:text-sm line-clamp-1 md:line-clamp-2 mb-1"
              style={{ color: branding.cardDescription }}
            >
              {item.description}
            </p>
          )}

          {item.variations.length > 0 && (
            <p
              className="text-xs"
              style={{ color: branding.textSecondary }}
            >
              {item.variations.length} options available
            </p>
          )}
        </div>

        {/* Price and CTA row */}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            {hasDiscount && (
              <span
                className="text-sm line-through"
                style={{ color: branding.textMuted }}
              >
                {formatPrice(item.price, { hideCurrencySymbol })}
              </span>
            )}
            <span
              className="text-base md:text-2xl font-bold"
              style={{ color: branding.cardPrice }}
            >
              {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
            </span>
          </div>

          {/* Elegant add button */}
          <button
            className="flex h-8 w-8 md:h-11 md:w-11 items-center justify-center rounded-full transition-all duration-300"
            style={{
              backgroundColor: branding.buttonPrimary,
              color: branding.buttonPrimaryText,
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)'
            }}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(item)
            }}
            disabled={!item.is_available}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)'
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.15)'
            }}
          >
            <svg
              className="h-4 w-4 md:h-5 md:w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
})
