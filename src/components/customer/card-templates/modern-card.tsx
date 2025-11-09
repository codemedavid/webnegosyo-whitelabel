'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ModernCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Modern Card Template
 * Contemporary design with overlapping elements and bold typography
 */
export function ModernCard({ item, onSelect, branding }: ModernCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-3xl shadow-md transition-all hover:shadow-2xl cursor-pointer"
      style={{ 
        backgroundColor: branding.cards,
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container with gradient overlay */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-transform group-hover:scale-110"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=="
        />
        
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {/* Badges - Top corners */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          {item.is_featured && (
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
          className="absolute bottom-4 left-4 rounded-xl px-3 py-2 backdrop-blur-md"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
        >
          <div className="flex items-center gap-2">
            {hasDiscount && (
              <span 
                className="text-xs line-through"
                style={{ color: branding.textMuted }}
              >
                {formatPrice(item.price)}
              </span>
            )}
            <span 
              className="text-xl font-black" 
              style={{ color: branding.primary }}
            >
              {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice)}
            </span>
          </div>
        </div>

        {/* Floating Add Button - bottom right */}
        <button
          className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-2xl shadow-2xl transition-all hover:scale-110"
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
            className="h-6 w-6" 
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
      <div className="relative -mt-6 mx-4 mb-4 rounded-2xl p-4 backdrop-blur-md"
        style={{ 
          backgroundColor: branding.cards,
          borderColor: branding.cardsBorder,
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        <h3 
          className="text-base font-black line-clamp-1"
          style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>
        
        {item.description && (
          <p 
            className="mt-1 text-xs line-clamp-2"
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
}

