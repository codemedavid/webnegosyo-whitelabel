'use client'

import { memo } from 'react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface ZenCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Zen Card Template
 * Ultra-minimal, borderless design with generous whitespace and muted tones
 */
export const ZenCard = memo(function ZenCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: ZenCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative cursor-pointer transition-all duration-500"
            style={{ backgroundColor: 'transparent' }}
            onClick={() => onSelect(item)}
        >
            {/* Image — soft rounded, no border */}
            <div className="relative aspect-[1/1] overflow-hidden rounded-2xl md:rounded-3xl bg-muted">
                {typeof item.image_url === 'string' && item.image_url.length > 0 && (
                    <OptimizedImage
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover transition-all duration-700 group-hover:scale-105 group-hover:brightness-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

                {/* Ultra-subtle badges */}
                {menuEngineeringEnabled && item.badge_text && (
                    <div className="absolute left-2 top-2 md:left-4 md:top-4 z-10">
                        <span
                            className="rounded-full px-2 py-0.5 md:px-2.5 md:py-1 text-[10px] font-medium tracking-wide"
                            style={{
                                backgroundColor: `${branding.primary}22`,
                                color: branding.primary,
                                backdropFilter: 'blur(12px)',
                            }}
                        >
                            {item.badge_text}
                        </span>
                    </div>
                )}

                {item.is_featured && !item.badge_text && (
                    <div className="absolute left-2 top-2 md:left-4 md:top-4">
                        <span className="text-sm opacity-70">✦</span>
                    </div>
                )}

                {hasDiscount && (
                    <div className="absolute right-2 top-2 md:right-4 md:top-4">
                        <span
                            className="text-[10px] font-medium tracking-wider uppercase"
                            style={{ color: branding.error, opacity: 0.9 }}
                        >
                            Sale
                        </span>
                    </div>
                )}

                {!item.is_available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                        <span
                            className="text-xs font-medium tracking-wider uppercase"
                            style={{ color: branding.textMuted }}
                        >
                            Unavailable
                        </span>
                    </div>
                )}
            </div>

            {/* Content — minimal, airy */}
            <div className="px-1 pt-2.5 pb-1 space-y-1 md:px-2 md:pt-4 md:pb-2 md:space-y-1.5">
                <h3
                    className="text-xs md:text-sm font-medium line-clamp-1 tracking-wide"
                    style={{ color: branding.cardTitle }}
                >
                    {item.name}
                </h3>

                {item.description && (
                    <p
                        className="text-[11px] md:text-xs line-clamp-1 md:line-clamp-2 leading-relaxed"
                        style={{ color: branding.cardDescription, opacity: 0.7 }}
                    >
                        {item.description}
                    </p>
                )}

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-baseline gap-1.5">
                        {hasDiscount && (
                            <span className="text-xs line-through" style={{ color: branding.textMuted, opacity: 0.5 }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span
                            className="text-sm md:text-base font-semibold tracking-tight"
                            style={{ color: branding.cardPrice }}
                        >
                            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100 hover:scale-110"
                        style={{
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText,
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!item.is_available}
                    >
                        <svg className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                {item.variations.length > 0 && (
                    <span
                        className="text-[10px] tracking-wider"
                        style={{ color: branding.textSecondary, opacity: 0.6 }}
                    >
                        {item.variations.length} sizes
                    </span>
                )}
            </div>
        </div>
    )
})
