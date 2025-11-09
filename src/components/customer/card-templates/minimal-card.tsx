'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface MinimalCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Minimal Card Template
 * Ultra-clean design with subtle borders and minimal decoration
 */
export function MinimalCard({ item, onSelect, branding }: MinimalCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-lg transition-all hover:shadow-md cursor-pointer"
      style={{ 
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-opacity group-hover:opacity-90"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=="
        />
        
        {/* Badges - Minimal style */}
        {item.is_featured && (
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
        
        {!item.is_available && (
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

      {/* Content - Centered and minimal */}
      <div className="p-3 text-center space-y-2">
        <h3 
          className="text-sm font-semibold line-clamp-1"
          style={{ color: branding.cardTitle }}
        >
          {item.name}
        </h3>
        
        {item.description && (
          <p 
            className="text-xs line-clamp-2"
            style={{ color: branding.cardDescription }}
          >
            {item.description}
          </p>
        )}
        
        <div className="flex items-center justify-center gap-1.5">
          {hasDiscount && (
            <span 
              className="text-xs line-through"
              style={{ color: branding.textMuted }}
            >
              {formatPrice(item.price)}
            </span>
          )}
          <span 
            className="text-base font-bold" 
            style={{ color: branding.cardPrice }}
          >
            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice)}
          </span>
        </div>

        {/* Simple add button */}
        <button
          className="w-full py-1.5 text-xs font-medium rounded transition-colors"
          style={{ 
            backgroundColor: branding.buttonPrimary,
            color: branding.buttonPrimaryText
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
          disabled={!item.is_available}
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
}

