'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface CompactCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Compact Card Template
 * Horizontal layout for space-efficient display
 */
export function CompactCard({ item, onSelect, branding }: CompactCardProps) {
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
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform group-hover:scale-110"
            sizes="128px"
            loading="lazy"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=="
          />
          
          {/* Badges overlay */}
          {item.is_featured && (
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
                  {formatPrice(item.price)}
                </div>
              )}
              <div 
                className="text-base font-bold" 
                style={{ color: branding.cardPrice }}
              >
                {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice)}
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

