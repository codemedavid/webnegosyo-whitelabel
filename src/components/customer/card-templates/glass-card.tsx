'use client'

import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface GlassCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Glass Card Template
 * Glassmorphism design with frosted glass effect, backdrop blur, and translucent layers
 */
export function GlassCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: GlassCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300"
            style={{
                background: `linear-gradient(135deg, ${branding.cards}cc, ${branding.cards}99)`,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: `${branding.cardsBorder}66`,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.15)'
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08)'
                e.currentTarget.style.transform = 'translateY(0)'
            }}
            onClick={() => onSelect(item)}
        >
            {/* Image Container */}
            <div className="relative aspect-[4/3] overflow-hidden">
                {typeof item.image_url === 'string' && item.image_url.length > 0 && (
                    <OptimizedImage
                        src={item.image_url}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

                {/* Frosted overlay at bottom */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-1/3"
                    style={{
                        background: 'linear-gradient(to top, rgba(255,255,255,0.4), transparent)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                    }}
                />

                {/* Badges */}
                {menuEngineeringEnabled && item.badge_text && (
                    <div className="absolute left-3 top-3 z-10">
                        <span
                            className="rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-xl"
                            style={{
                                backgroundColor: `${branding.primary}dd`,
                                color: branding.buttonPrimaryText || '#ffffff',
                            }}
                        >
                            {item.badge_text}
                        </span>
                    </div>
                )}

                {item.is_featured && !item.badge_text && (
                    <div className="absolute left-3 top-3">
                        <span
                            className="rounded-full px-2 py-1 text-xs font-medium backdrop-blur-md"
                            style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                                color: branding.primary,
                            }}
                        >
                            ⭐ Featured
                        </span>
                    </div>
                )}

                {hasDiscount && (
                    <div className="absolute right-3 top-3">
                        <span
                            className="rounded-full px-2 py-1 text-xs font-bold backdrop-blur-md"
                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.85)', color: '#ffffff' }}
                        >
                            SALE
                        </span>
                    </div>
                )}

                {!item.is_available && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(255,255,255,0.3)' }}
                    >
                        <span
                            className="rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-xl"
                            style={{ backgroundColor: 'rgba(255,255,255,0.8)', color: branding.textPrimary }}
                        >
                            Unavailable
                        </span>
                    </div>
                )}

                {/* Floating Add Button */}
                <button
                    className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 backdrop-blur-xl"
                    style={{
                        backgroundColor: `${branding.buttonPrimary}dd`,
                        color: branding.buttonPrimaryText,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelect(item)
                    }}
                    disabled={!item.is_available}
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>

            {/* Content — frosted glass panel */}
            <div
                className="p-4 space-y-2"
                style={{
                    background: `linear-gradient(135deg, ${branding.cards}ee, ${branding.cards}cc)`,
                }}
            >
                <h3
                    className="text-base font-semibold line-clamp-1"
                    style={{ color: branding.cardTitle }}
                >
                    {item.name}
                </h3>

                {item.description && (
                    <p
                        className="text-sm line-clamp-2"
                        style={{ color: branding.cardDescription, opacity: 0.85 }}
                    >
                        {item.description}
                    </p>
                )}

                <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                        {hasDiscount && (
                            <span className="text-sm line-through" style={{ color: branding.textMuted }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span className="text-lg font-bold" style={{ color: branding.cardPrice }}>
                            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    {item.variations.length > 0 && (
                        <span
                            className="text-xs font-medium rounded-full px-2 py-0.5 backdrop-blur-sm"
                            style={{
                                backgroundColor: `${branding.buttonSecondary}88`,
                                color: branding.buttonSecondaryText,
                            }}
                        >
                            {item.variations.length} sizes
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
