'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface BoldCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Bold Card Template
 * High contrast design with prominent CTA
 */
export function BoldCard({ item, onSelect, branding }: BoldCardProps) {
  const hasDiscount = item.discounted_price && item.discounted_price < item.price
  const displayPrice = hasDiscount ? item.discounted_price! : item.price

  return (
    <div
      className="group relative overflow-hidden rounded-2xl shadow-lg transition-all hover:shadow-2xl cursor-pointer"
      style={{ 
        backgroundColor: branding.cards,
        borderColor: branding.primary,
        borderWidth: '2px',
        borderStyle: 'solid'
      }}
      onClick={() => onSelect(item)}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=="
        />
        
        {/* Strong dark gradient for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        
        {/* Badges - Bold style */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start gap-2">
          {item.is_featured && (
            <div 
              className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide"
              style={{ 
                backgroundColor: branding.warning,
                color: '#000000'
              }}
            >
              ⭐ Featured
            </div>
          )}
          {hasDiscount && (
            <div 
              className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide"
              style={{ 
                backgroundColor: branding.error,
                color: '#ffffff'
              }}
            >
              🔥 SALE
            </div>
          )}
        </div>
        
        {!item.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="rounded-xl bg-white px-6 py-3 text-base font-black uppercase tracking-wide text-gray-900">
              Sold Out
            </div>
          </div>
        )}

        {/* Content overlaid on image - bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
          <div>
            <h3 
              className="text-xl font-black line-clamp-1"
              style={{ color: '#ffffff' }}
            >
              {item.name}
            </h3>
            
            {item.description && (
              <p 
                className="text-sm font-medium text-white/90 line-clamp-2 mt-1"
              >
                {item.description}
              </p>
            )}
            
            {item.variations.length > 0 && (
              <p 
                className="text-xs font-semibold text-white/80 mt-1"
              >
                {item.variations.length} SIZES AVAILABLE
              </p>
            )}
          </div>
          
          {/* Price display */}
          <div className="flex items-baseline gap-2">
            {hasDiscount && (
              <span 
                className="text-sm font-bold line-through text-white/60"
              >
                {formatPrice(item.price)}
              </span>
            )}
            <span 
              className="text-3xl font-black text-white"
            >
              {item.variations.length > 0 ? 'FROM ' : ''}{formatPrice(displayPrice)}
            </span>
          </div>
        </div>
      </div>

      {/* Large prominent CTA button */}
      <button
        className="w-full py-4 text-base font-black uppercase tracking-wide transition-all"
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
          e.currentTarget.style.transform = 'scale(1.02)'
          e.currentTarget.style.opacity = '0.9'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.opacity = '1'
        }}
      >
        {item.is_available ? (
          <>
            <span className="text-2xl mr-2">+</span>
            Add to Cart
          </>
        ) : (
          'Unavailable'
        )}
      </button>
    </div>
  )
}

