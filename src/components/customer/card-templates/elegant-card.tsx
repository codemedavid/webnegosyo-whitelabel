'use client'

import Image from 'next/image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ElegantCardProps {
  item: MenuItem
  onSelect: (item: MenuItem) => void
  branding: BrandingColors
}

/**
 * Elegant Card Template
 * Sophisticated design with soft shadows and refined spacing
 */
export function ElegantCard({ item, onSelect, branding }: ElegantCardProps) {
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
        <Image
          src={item.image_url}
          alt={item.name}
          fill
          className="object-cover transition-all duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNzAwIiBoZWlnaHQ9IjQ3NSIgZmlsbD0iI2VlZSIvPjwvc3ZnPg=="
        />
        
        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/10" />
        
        {/* Badges - Elegant styling */}
        {item.is_featured && (
          <div className="absolute left-4 top-4">
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
          <div className="absolute right-4 top-4">
            <div 
              className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl"
              style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.95)',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
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
      <div className="p-5 space-y-3">
        <div>
          <h3 
            className="text-lg font-semibold line-clamp-1 mb-1"
            style={{ color: branding.cardTitle }}
          >
            {item.name}
          </h3>
          
          {item.description && (
            <p 
              className="text-sm line-clamp-2 mb-1"
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
                {formatPrice(item.price)}
              </span>
            )}
            <span 
              className="text-2xl font-bold" 
              style={{ color: branding.cardPrice }}
            >
              {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice)}
            </span>
          </div>

          {/* Elegant add button */}
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300"
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
              className="h-5 w-5" 
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
}

