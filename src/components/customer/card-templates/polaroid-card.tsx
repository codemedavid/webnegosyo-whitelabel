'use client'

import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface PolaroidCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Polaroid Card Template
 * Retro photo-style card with thick white frame, slight tilt on hover, and caption-style text
 */
export function PolaroidCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: PolaroidCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative cursor-pointer transition-all duration-300"
            style={{
                backgroundColor: branding.cards,
                padding: '10px 10px 0 10px',
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
            <div className="relative aspect-square overflow-hidden bg-muted" style={{ borderRadius: '2px' }}>
                {typeof item.image_url === 'string' && item.image_url.length > 0 && (
                    <OptimizedImage
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

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
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            SALE
                        </span>
                    </div>
                )}

                {!item.is_available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="rounded bg-white/90 px-3 py-1 text-sm font-medium text-gray-900">
                            Unavailable
                        </span>
                    </div>
                )}
            </div>

            {/* Caption area — thick bottom like a real polaroid */}
            <div className="py-4 px-1 space-y-1.5">
                <h3
                    className="text-base font-semibold line-clamp-1"
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

                <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                        {hasDiscount && (
                            <span className="text-xs line-through" style={{ color: branding.textMuted }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span className="text-lg font-bold" style={{ color: branding.cardPrice }}>
                            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:scale-110"
                        style={{
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!item.is_available}
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
}
