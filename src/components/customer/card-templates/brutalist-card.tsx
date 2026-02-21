'use client'

import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface BrutalistCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Brutalist Card Template
 * Raw, industrial design with thick borders, stark contrast, and geometric shapes
 */
export function BrutalistCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: BrutalistCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative overflow-hidden cursor-pointer transition-all duration-150"
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
            <div className="relative aspect-[3/2] overflow-hidden bg-muted">
                {typeof item.image_url === 'string' && item.image_url.length > 0 && (
                    <OptimizedImage
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

                {/* Badges — raw style */}
                {menuEngineeringEnabled && item.badge_text && (
                    <div className="absolute left-0 top-0 z-10">
                        <span
                            className="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest"
                            style={{ backgroundColor: branding.primary, color: branding.buttonPrimaryText || '#ffffff' }}
                        >
                            {item.badge_text}
                        </span>
                    </div>
                )}

                {item.is_featured && !item.badge_text && (
                    <div className="absolute left-0 top-0">
                        <span
                            className="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest"
                            style={{ backgroundColor: branding.warning, color: '#000000' }}
                        >
                            ★ FEATURED
                        </span>
                    </div>
                )}

                {hasDiscount && (
                    <div className="absolute right-0 top-0">
                        <span
                            className="inline-block px-3 py-1 text-xs font-black uppercase tracking-widest"
                            style={{ backgroundColor: branding.error, color: '#ffffff' }}
                        >
                            SALE
                        </span>
                    </div>
                )}

                {!item.is_available && (
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

            {/* Content — raw and direct */}
            <div
                className="p-4 space-y-2"
                style={{ borderTop: `3px solid ${branding.cardTitle || '#000000'}` }}
            >
                <h3
                    className="text-lg font-black uppercase tracking-tight line-clamp-1"
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

                <div className="flex items-end justify-between pt-1">
                    <div>
                        {hasDiscount && (
                            <span className="block text-xs line-through" style={{ color: branding.textMuted }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span
                            className="text-2xl font-black"
                            style={{ color: branding.cardPrice, fontFamily: 'ui-monospace, monospace' }}
                        >
                            {item.variations.length > 0 ? 'FROM ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-10 w-10 items-center justify-center transition-all hover:scale-110"
                        style={{
                            backgroundColor: branding.buttonPrimary,
                            color: branding.buttonPrimaryText,
                            border: `2px solid ${branding.cardTitle || '#000000'}`,
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!item.is_available}
                    >
                        <span className="text-xl font-black">+</span>
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
}
