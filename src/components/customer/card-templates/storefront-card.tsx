'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type { MenuItem } from '@/types/database'

interface StorefrontCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Storefront Card Template
 * Square product-led catalog card inspired by marketplace food apps.
 */
export const StorefrontCard = memo(function StorefrontCard({
  item,
  onSelect,
  branding,
  menuEngineeringEnabled,
  hideCurrencySymbol,
}: StorefrontCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div className="group cursor-pointer" onClick={() => onSelect(item)}>
      <div className="space-y-2.5 md:space-y-3">
        <div
          className="relative aspect-square overflow-hidden rounded-[22px] md:rounded-[26px] shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg"
          style={{ backgroundColor: branding.primary }}
        >
          {typeof item.image_url === 'string' && item.image_url.length > 0 ? (
            <OptimizedImage
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center">
              <span
                className="text-sm font-semibold"
                style={{ color: branding.buttonPrimaryText || '#ffffff' }}
              >
                {item.name}
              </span>
            </div>
          )}

          {menuEngineeringEnabled && item.badge_text && (
            <div className="absolute left-3 top-3 z-10 md:left-4 md:top-4">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.94)',
                  color: branding.primary,
                }}
              >
                {item.badge_text}
              </span>
            </div>
          )}

          {item.is_featured && !item.badge_text && (
            <div className="absolute left-3 top-3 z-10 md:left-4 md:top-4">
              <span className="rounded-full bg-white/95 px-2 py-1 text-xs shadow-sm">⭐</span>
            </div>
          )}

          {hasDiscount && (
            <div className="absolute right-3 top-3 z-10 md:right-4 md:top-4">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm"
                style={{ backgroundColor: branding.error, color: '#ffffff' }}
              >
                SALE
              </span>
            </div>
          )}

          {!item.is_available && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-gray-900">
                Unavailable
              </span>
            </div>
          )}

          <button
            className="absolute bottom-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-transform duration-200 hover:scale-110 md:bottom-4 md:right-4 md:h-14 md:w-14"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(item)
            }}
            disabled={!item.is_available}
            aria-label={`Add ${item.name}`}
          >
            <svg
              className="h-5 w-5 md:h-6 md:w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.25}
                d="M12 5v14m7-7H5"
              />
            </svg>
          </button>
        </div>

        <div className="px-0.5">
          <h3
            className="line-clamp-2 text-base font-bold leading-tight md:text-[1.35rem] md:leading-tight"
            style={{ color: branding.cardTitle }}
          >
            {item.name}
          </h3>

          <div className="mt-1.5 flex items-baseline gap-2 md:mt-2">
            {hasDiscount && (
              <span
                className="text-sm line-through md:text-base"
                style={{ color: branding.textMuted }}
              >
                {formatPrice(item.price, { hideCurrencySymbol })}
              </span>
            )}

            <span
              className="text-[0.95rem] font-medium md:text-lg"
              style={{ color: branding.cardPrice }}
            >
              {item.variations.length > 0 ? 'from ' : ''}
              {formatPrice(displayPrice, { hideCurrencySymbol })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})
