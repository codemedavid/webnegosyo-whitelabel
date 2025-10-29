'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface MenuItemCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

export function MenuItemCard({ item, onSelect, branding }: MenuItemCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-2xl shadow-sm transition-all hover:shadow-xl cursor-pointer"
      style={{ 
        backgroundColor: branding.cards,
        borderColor: branding.cardsBorder,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        
        {/* Overlay Elements */}
        {item.is_featured && (
          <div className="absolute left-3 top-3">
            <span className="text-xl">⭐</span>
          </div>
        )}
        
        {hasDiscount && (
          <div className="absolute right-3 top-3">
            <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">
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
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-110 hover:opacity-90"
          style={{ backgroundColor: branding.buttonPrimary }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item)
          }}
          disabled={!item.is_available}
        >
          <span className="text-lg font-bold">+</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 
          className="mb-2 text-lg font-bold line-clamp-1"
          style={{ color: branding.textPrimary }}
        >
          {item.name}
        </h3>
        
        <div className="flex items-center gap-2">
          {hasDiscount && (
            <span 
              className="text-sm line-through"
              style={{ color: branding.textMuted }}
            >
              {formatPrice(item.price)}
            </span>
          )}
          <span 
            className="text-lg font-bold" 
            style={{ color: branding.primary }}
          >
            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice)}
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
}

