'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface MagazineCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Magazine Card Template
 * Editorial-style with full-bleed image and text overlay, like a food magazine spread
 */
export const MagazineCard = memo(function MagazineCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: MagazineCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300 hover:shadow-2xl"
            style={{ backgroundColor: branding.cards }}
            onClick={() => onSelect(item)}
        >
            {/* Full-bleed image */}
            <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                {typeof item.image_url === 'string' && item.image_url.length > 0 && (
                    <OptimizedImage
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

                {/* Editorial gradient overlay — bottom heavy */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)',
                    }}
                />

                {/* Top badges */}
                <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 flex justify-between items-start z-10">
                    {menuEngineeringEnabled && item.badge_text ? (
                        <span
                            className="rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
                        >
                            {item.badge_text}
                        </span>
                    ) : item.is_featured ? (
                        <span
                            className="rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md"
                            style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: branding.primary }}
                        >
                            ⭐ Editor&apos;s Pick
                        </span>
                    ) : <div />}

                    {hasDiscount && (
                        <span
                            className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{ backgroundColor: branding.error, color: '#ffffff' }}
                        >
                            SALE
                        </span>
                    )}
                </div>

                {!item.is_available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
                        <span className="text-sm font-semibold text-white/90 uppercase tracking-wider">
                            Unavailable
                        </span>
                    </div>
                )}

                {/* Editorial content overlay — bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1.5 md:p-5 md:space-y-3 z-10">
                    {/* Category-like label */}
                    {item.variations.length > 0 && (
                        <span
                            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70"
                        >
                            {item.variations.length} sizes available
                        </span>
                    )}

                    <h3
                        className="text-base md:text-xl font-bold line-clamp-1 md:line-clamp-2 leading-tight text-white"
                    >
                        {item.name}
                    </h3>

                    {item.description && (
                        <p className="text-xs md:text-sm line-clamp-1 md:line-clamp-2 text-white/80 leading-relaxed">
                            {item.description}
                        </p>
                    )}

                    {/* Price row */}
                    <div className="flex items-center justify-between pt-1">
                        <div className="flex items-baseline gap-2">
                            {hasDiscount && (
                                <span className="text-sm line-through text-white/50">
                                    {formatPrice(item.price, { hideCurrencySymbol })}
                                </span>
                            )}
                            <span className="text-base md:text-2xl font-bold text-white">
                                {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                            </span>
                        </div>

                        <button
                            className="flex h-8 w-8 md:h-11 md:w-11 items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
                            style={{
                                backgroundColor: branding.buttonPrimary,
                                color: branding.buttonPrimaryText,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                            }}
                            onClick={(e) => {
                                e.stopPropagation()
                                onSelect(item)
                            }}
                            disabled={!item.is_available}
                        >
                            <svg className="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
})
