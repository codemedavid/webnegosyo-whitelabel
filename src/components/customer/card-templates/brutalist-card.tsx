'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import { hasDishPhoto } from '@/lib/dish-photo'
import { TextCardTags } from './text-card-tags'

interface BrutalistCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    isOrderable: boolean
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
  priority?: boolean
}

/**
 * Brutalist Card Template
 * Raw, industrial design with thick borders, stark contrast, and geometric shapes.
 * A dish without a photo is the slab of type alone, its labels stamped above the name.
 */
export const BrutalistCard = memo(function BrutalistCard({ item, onSelect, branding, isOrderable, menuEngineeringEnabled, hideCurrencySymbol, priority }: BrutalistCardProps) {
    const hasDiscount = Boolean(item.discounted_price && item.discounted_price < item.price)
    const displayPrice = hasDiscount ? item.discounted_price! : item.price
    const hasPhoto = hasDishPhoto(item)
    const ink = branding.cardTitle || '#000000'

    return (
        <div
            className={`group relative overflow-hidden cursor-pointer transition-all duration-150 ${hasPhoto ? '' : 'flex h-full flex-col'}`}
            style={{
                backgroundColor: branding.cards,
                border: `3px solid ${branding.cardTitle || '#000000'}`,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translate(-4px, -4px)'
                e.currentTarget.style.boxShadow = `6px 6px 0px ${branding.primary}`
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translate(0, 0)'
                e.currentTarget.style.boxShadow = 'none'
            }}
            onClick={() => onSelect(item)}
        >
            {/* Image Container */}
            {hasPhoto && (
                <div className="relative aspect-[3/2] overflow-hidden bg-muted">
                    <OptimizedImage
                        src={item.image_url}
                        fallbackSrc={branding.logoUrl}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading={priority ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : undefined}
                    />

                    {/* Badges — raw style */}
                    {menuEngineeringEnabled && item.badge_text && (
                        <div className="absolute left-0 top-0 z-10">
                            <span
                                className="inline-block px-2 py-0.5 text-[10px] md:px-3 md:py-1 md:text-xs font-black uppercase tracking-widest"
                                style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
                            >
                                {item.badge_text}
                            </span>
                        </div>
                    )}

                    {item.is_featured && !item.badge_text && (
                        <div className="absolute left-0 top-0">
                            <span
                                className="inline-block px-2 py-0.5 text-[10px] md:px-3 md:py-1 md:text-xs font-black uppercase tracking-widest"
                                style={{ backgroundColor: branding.warning, color: '#000000' }}
                            >
                                ★ FEATURED
                            </span>
                        </div>
                    )}

                    {hasDiscount && (
                        <div className="absolute right-0 top-0">
                            <span
                                className="inline-block px-2 py-0.5 text-[10px] md:px-3 md:py-1 md:text-xs font-black uppercase tracking-widest"
                                style={{ backgroundColor: branding.error, color: '#ffffff' }}
                            >
                                SALE
                            </span>
                        </div>
                    )}

                    {!isOrderable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                            <span
                                className="px-6 py-2 text-sm font-black uppercase tracking-widest"
                                style={{ backgroundColor: branding.cards, color: branding.textPrimary, border: `2px solid ${branding.textPrimary}` }}
                            >
                                SOLD OUT
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Content — raw and direct */}
            <div
                className={`p-2.5 space-y-1 md:p-4 md:space-y-2 ${hasPhoto ? '' : 'flex flex-1 flex-col'}`}
                style={hasPhoto ? { borderTop: `3px solid ${ink}` } : undefined}
            >
                {!hasPhoto && (
                    <TextCardTags
                        item={item}
                        branding={branding}
                        isOrderable={isOrderable}
                        hasDiscount={hasDiscount}
                        menuEngineeringEnabled={menuEngineeringEnabled}
                        soldOutLabel="SOLD OUT"
                        tagClassName="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest"
                        soldOutStyle={{ backgroundColor: ink, color: branding.cards }}
                    />
                )}
                <h3
                    className={`text-sm md:text-lg font-black uppercase tracking-tight ${hasPhoto ? 'line-clamp-1' : 'line-clamp-2 leading-tight'}`}
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

                <div className={`flex items-end justify-between pt-1 ${hasPhoto ? '' : 'mt-auto'}`}>
                    <div>
                        {hasDiscount && (
                            <span className="block text-xs line-through" style={{ color: branding.textMuted }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span
                            className="text-lg md:text-2xl font-black"
                            data-branding-scope="storefront/card-price" style={{ color: branding.cardPrice, fontFamily: 'ui-monospace, monospace' }}
                        >
                            {item.variations.length > 0 ? 'FROM ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center transition-all hover:scale-110"
                        style={{
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText,
                            border: `2px solid ${branding.cardTitle || '#000000'}`,
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!isOrderable}
                        aria-label={`Add ${item.name}`}
                    >
                        <span className="text-base md:text-xl font-black">+</span>
                    </button>
                </div>

                {item.variations.length > 0 && (
                    <div>
                        <span
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{ color: branding.textSecondary }}
                        >
                            {item.variations.length} options
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
})
