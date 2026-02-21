'use client'

import { OptimizedImage } from '@/components/shared/optimized-image'
import type { MenuItem } from '@/types/database'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'

interface NeonCardProps {
    item: MenuItem
    onSelect: (item: MenuItem) => void
    branding: BrandingColors
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
}

/**
 * Neon Card Template
 * Dark card with neon glow borders using the primary color, vibrant accents
 */
export function NeonCard({ item, onSelect, branding, menuEngineeringEnabled, hideCurrencySymbol }: NeonCardProps) {
    const hasDiscount = item.discounted_price && item.discounted_price < item.price
    const displayPrice = hasDiscount ? item.discounted_price! : item.price

    return (
        <div
            className="group relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300"
            style={{
                backgroundColor: '#0a0a0a',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: `${branding.primary}44`,
                boxShadow: `0 0 15px ${branding.primary}22, inset 0 0 15px ${branding.primary}08`,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${branding.primary}aa`
                e.currentTarget.style.boxShadow = `0 0 30px ${branding.primary}44, 0 0 60px ${branding.primary}22, inset 0 0 20px ${branding.primary}11`
                e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${branding.primary}44`
                e.currentTarget.style.boxShadow = `0 0 15px ${branding.primary}22, inset 0 0 15px ${branding.primary}08`
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
                        className="object-cover transition-transform duration-500 group-hover:scale-110 brightness-90"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                )}

                {/* Dark vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                {/* Neon line at bottom of image */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${branding.primary}, transparent)`,
                        boxShadow: `0 0 10px ${branding.primary}, 0 0 20px ${branding.primary}66`,
                    }}
                />

                {/* Badges — neon style */}
                {menuEngineeringEnabled && item.badge_text && (
                    <div className="absolute left-3 top-3 z-10">
                        <span
                            className="rounded-sm px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                                backgroundColor: `${branding.primary}dd`,
                                color: branding.buttonPrimaryText || '#ffffff',
                                boxShadow: `0 0 12px ${branding.primary}88`,
                            }}
                        >
                            {item.badge_text}
                        </span>
                    </div>
                )}

                {item.is_featured && !item.badge_text && (
                    <div className="absolute left-3 top-3">
                        <span
                            className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                                backgroundColor: 'rgba(255, 200, 0, 0.9)',
                                color: '#000000',
                                boxShadow: '0 0 12px rgba(255, 200, 0, 0.5)',
                            }}
                        >
                            ★ Featured
                        </span>
                    </div>
                )}

                {hasDiscount && (
                    <div className="absolute right-3 top-3">
                        <span
                            className="rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                                backgroundColor: 'rgba(255, 50, 80, 0.9)',
                                color: '#ffffff',
                                boxShadow: '0 0 12px rgba(255, 50, 80, 0.5)',
                            }}
                        >
                            SALE
                        </span>
                    </div>
                )}

                {!item.is_available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <span
                            className="text-sm font-bold uppercase tracking-wider"
                            style={{
                                color: branding.primary,
                                textShadow: `0 0 10px ${branding.primary}`,
                            }}
                        >
                            Unavailable
                        </span>
                    </div>
                )}
            </div>

            {/* Content — dark theme */}
            <div className="p-4 space-y-2">
                <h3
                    className="text-base font-bold line-clamp-1"
                    style={{ color: '#f0f0f0' }}
                >
                    {item.name}
                </h3>

                {item.description && (
                    <p className="text-xs line-clamp-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        {item.description}
                    </p>
                )}

                <div className="flex items-center justify-between pt-1">
                    <div className="flex items-baseline gap-2">
                        {hasDiscount && (
                            <span className="text-xs line-through" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {formatPrice(item.price, { hideCurrencySymbol })}
                            </span>
                        )}
                        <span
                            className="text-lg font-bold"
                            style={{
                                color: branding.primary,
                                textShadow: `0 0 8px ${branding.primary}44`,
                            }}
                        >
                            {item.variations.length > 0 ? 'from ' : ''}{formatPrice(displayPrice, { hideCurrencySymbol })}
                        </span>
                    </div>

                    <button
                        className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 hover:scale-110"
                        style={{
                            backgroundColor: 'transparent',
                            color: branding.primary,
                            border: `1px solid ${branding.primary}88`,
                            boxShadow: `0 0 8px ${branding.primary}33`,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = branding.primary
                            e.currentTarget.style.color = branding.buttonPrimaryText || '#ffffff'
                            e.currentTarget.style.boxShadow = `0 0 16px ${branding.primary}66`
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.color = branding.primary
                            e.currentTarget.style.boxShadow = `0 0 8px ${branding.primary}33`
                        }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSelect(item)
                        }}
                        disabled={!item.is_available}
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>

                {item.variations.length > 0 && (
                    <span
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: `${branding.primary}88` }}
                    >
                        {item.variations.length} sizes available
                    </span>
                )}
            </div>
        </div>
    )
}
