'use client'

import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface CompactCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
  menuEngineeringEnabled?: boolean
  hideCurrencySymbol?: boolean
}

/**
 * Compact Card Template
 * Horizontal layout for space-efficient display
 */
export function CompactCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: CompactCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-xl transition-all hover:shadow-lg cursor-pointer"
      style={{
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-stretch">
        {/* Image - Left side */}
        <div className="relative w-28 sm:w-32 flex-shrink-0 overflow-hidden bg-muted">
          {typeof item.image_url === 'string' && item.image_url ? (
            <OptimizedImage
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover transition-transform group-hover:scale-110"
              sizes="128px"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: branding.border }}>
              <svg className="h-10 w-10 opacity-40" fill="currentColor" viewBox="0 0 24 24" style={{ color: branding.textMuted }}>
                <path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
              </svg>
            </div>
          )}

          {/* Custom Badge */}
          {menuEngineeringEnabled && item.badge_text && (
            <div className="absolute left-1 top-1 z-10">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
              >
                {item.badge_text}
              </span>
            </div>
          )}

          {/* Badges overlay */}
          {item.is_featured && !item.badge_text && (
            <div className="absolute left-1 top-1">
              <span className="text-sm">⭐</span>
            </div>
          )}

          {hasDiscount && (
            <div className="absolute right-1 top-1">
              <span
                className="rounded px-1 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: branding.error }}
              >
                SALE
              </span>
            </div>
          )}

          {!item.is_available && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-gray-900">
                Out
              </span>
            </div>
          )}
        </div>

        {/* Content - Right side */}
        <div className="flex flex-1 flex-col justify-between p-3">
          <div>
            <h3
              className="text-sm font-bold line-clamp-1 mb-1"
              style={{ color: branding.cardTitle }}
            >
              {item.name}
            </h3>

            {item.description && (
              <p
                className="text-[11px] line-clamp-2 mb-1"
                style={{ color: branding.cardDescription }}
              >
                {item.description}
              </p>
            )}

            {item.variations.length > 0 && (
              <p
                className="text-[11px]"
                style={{ color: branding.textSecondary }}
              >
                {item.variations.length} options
              </p>
            )}
          </div>

          {/* Price and button row */}
          <div className="flex items-end justify-between mt-2">
            <div>
              {hasDiscount && (
                <div
                  className="text-[11px] line-through"
                  style={{ color: branding.textMuted }}
                >
                  {formatPrice(item.price, { hideCurrencySymbol })}
                </div>
              )}
              <div
                className="text-base font-bold"
                style={{ color: branding.cardPrice }}
              >
                {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
              </div>
            </div>

            {/* Compact add button */}
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-all hover:scale-110"
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
                className="h-4 w-4"
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
    </div>
  )
}

