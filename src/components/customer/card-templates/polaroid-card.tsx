'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { hasDishPhoto } from '@/lib/dish-photo'
import { TextCardTags } from './text-card-tags'

interface PolaroidCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    isOrderable: boolean
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
  priority?: boolean
}

/**
 * Polaroid Card Template
 * Retro photo-style card with thick white frame, slight tilt on hover, and caption-style text.
 * A dish without a photo keeps the frame: the caption sits inside a hairline mat.
 */
export const PolaroidCard = memo(function PolaroidCard({ item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority }: PolaroidCardProps) {
    const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
    const displayPrice = hasDiscount ? item.discounted_price! : item.price
    const hasPhoto = hasDishPhoto(item)

    return (
        <div
            className={`group relative cursor-pointer transition-all duration-300 ${hasPhoto ? '' : 'flex h-full flex-col'}`}
            style={{
                backgroundColor: branding.cards,
                padding: hasPhoto ? '10px 10px 0 10px' : '10px',
                borderRadius: '4px',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'rotate(-1.5deg) scale(1.02)'
                e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.18), 0 4px 8px rgba(0, 0, 0, 0.08)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'rotate(0) scale(1)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)'
            }}
            onClick={() => onSelect(item)}
        >
            {/* Image — like a polaroid photo */}
            {hasPhoto && (
                <div className="relative aspect-square overflow-hidden bg-muted" style={{ borderRadius: '2px' }}>
                    <OptimizedImage
                        src={item.image_url}
                        fallbackSrc={branding.logoUrl}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading={priority ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : undefined}
                    />

                    {/* Badges */}
                    {menuEngineeringEnabled && item.badge_text && (
                        <div className="absolute left-2 top-2 z-10">
                            <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm"
                                style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
                            >
                                {item.badge_text}
                            </span>
                        </div>
                    )}

                    {item.is_featured && !item.badge_text && (
                        <div className="absolute left-2 top-2">
                            <span className="text-sm">⭐</span>
                        </div>
                    )}

                    {hasDiscount && (
                        <div className="absolute right-2 top-2">
                            <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm"
                                style={{ backgroundColor: branding.error, color: '#ffffff' }}
                            >
                                SALE
                            </span>
                        </div>
                    )}

                    {!isOrderable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <span className="rounded bg-white/90 px-3 py-1 text-sm font-medium text-gray-900">
                                Unavailable
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Caption area — thick bottom like a real polaroid */}
            <div
                className={hasPhoto
                    ? 'py-2 px-0.5 space-y-1 md:py-4 md:px-1 md:space-y-1.5'
                    : 'flex flex-1 flex-col space-y-1 p-2.5 md:space-y-1.5 md:p-3'}
                style={hasPhoto ? undefined : { border: `1px solid ${branding.cardsBorder}`, borderRadius: '2px' }}
            >
                {!hasPhoto && (
                    <TextCardTags
                        item={item}
                        branding={branding}
                        isOrderable={isOrderable}
                        hasDiscount={hasDiscount}
                        menuEngineeringEnabled={menuEngineeringEnabled}
                        soldOutLabel="Unavailable"
                        tagClassName="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    />
                )}
                <h3
                    className={`text-sm md:text-base font-semibold ${hasPhoto ? 'line-clamp-1' : 'line-clamp-2 leading-snug'}`}
                    data-branding-scope="storefront/card-title" style={{ color: branding.cardTitle }}
                >
                    {item.name}
                </h3>

                {item.description && (
                    <p
                        className="text-[11px] md:text-xs line-clamp-1 md:line-clamp-2"
                        data-branding-scope="storefront/card-description" style={{ color: branding.cardDescription }}
                    >
                        {item.description}
                    </p>
                )}

                <div className={`flex items-center justify-between pt-1 ${hasPhoto ? '' : 'mt-auto'}`}>
                    <div className="flex items-center gap-1.5">
                        {hasDiscount && (
                            <span className="text-xs line-through" style={{ color: branding.textMuted }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span className="text-sm md:text-lg font-bold" data-branding-scope="storefront/card-price" style={{ color: branding.cardPrice }}>
                            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full transition-all hover:scale-110"
                        style={{
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!isOrderable}
                        aria-label={`Add ${item.name}`}
                    >
                        <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                {item.variations.length > 0 && (
                    <div className="pt-1">
                        <span
                            className="text-[10px] font-medium"
                            style={{ color: branding.textSecondary }}
                        >
                            {item.variations.length} sizes available
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
})
