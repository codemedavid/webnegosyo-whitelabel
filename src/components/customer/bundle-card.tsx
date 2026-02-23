'use client'

import { memo } from 'react'
import { Package } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithItems } from '@/lib/bundles-service'

interface BundleCardProps {
    bundle: BundleWithItems
    onSelect: (bundle: BundleWithItems) => void
    branding: BrandingColors
    hideCurrencySymbol?: boolean
}

/**
 * Customer-facing bundle card — matches the visual language of menu item cards
 * with a distinct "bundle" identity (grouped item images, savings badge).
 */
export const BundleCard = memo(function BundleCard({
    bundle,
    onSelect,
    branding,
    hideCurrencySymbol,
}: BundleCardProps) {
    // Compute the sum of individual item prices
    const originalTotal = (bundle.items ?? []).reduce(
        (sum, bi) => sum + (bi.menu_item?.price ?? 0) * bi.quantity,
        0
    )

    const bundlePrice =
        bundle.pricing_type === 'fixed'
            ? bundle.fixed_price ?? 0
            : originalTotal * (1 - (bundle.discount_percent ?? 0) / 100)

    const savings = originalTotal - bundlePrice

    // Show up to 4 item thumbnails
    const thumbnailItems = (bundle.items ?? [])
        .filter((bi) => bi.menu_item?.image_url)
        .slice(0, 4)

    return (
        <div
            className="group relative overflow-hidden rounded-2xl shadow-sm transition-all hover:shadow-xl cursor-pointer"
            style={{
                backgroundColor: branding.cards,
                borderColor: branding.cardsBorder,
                borderWidth: '1px',
                borderStyle: 'solid',
            }}
            onClick={() => onSelect(bundle)}
        >
            {/* Hero image or item thumbnails */}
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {bundle.image_url ? (
                    <OptimizedImage
                        src={bundle.image_url}
                        alt={bundle.name}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        loading="lazy"
                    />
                ) : thumbnailItems.length > 0 ? (
                    <div className="grid grid-cols-2 h-full">
                        {thumbnailItems.map((bi, idx) => (
                            <div key={bi.menu_item_id ?? idx} className="relative overflow-hidden">
                                <OptimizedImage
                                    src={bi.menu_item!.image_url!}
                                    alt={bi.menu_item!.name}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 25vw, 15vw"
                                    loading="lazy"
                                />
                            </div>
                        ))}
                        {/* Fill remaining grid cells */}
                        {thumbnailItems.length < 4 &&
                            Array.from({ length: 4 - thumbnailItems.length }).map((_, i) => (
                                <div
                                    key={`placeholder-${i}`}
                                    className="flex items-center justify-center"
                                    style={{ backgroundColor: `${branding.primary}10` }}
                                >
                                    <Package className="h-6 w-6" style={{ color: branding.primary }} />
                                </div>
                            ))}
                    </div>
                ) : (
                    <div
                        className="flex items-center justify-center h-full"
                        style={{ backgroundColor: `${branding.primary}10` }}
                    >
                        <Package className="h-12 w-12" style={{ color: branding.primary }} />
                    </div>
                )}

                {/* Bundle badge */}
                <div className="absolute left-3 top-3 z-10">
                    <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold shadow-sm"
                        style={{
                            backgroundColor: branding.primary,
                            color: branding.buttonPrimaryText || '#ffffff',
                        }}
                    >
                        Bundle
                    </span>
                </div>

                {/* Savings badge */}
                {savings > 0 && (
                    <div className="absolute right-3 top-3 z-10">
                        <span className="rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white shadow-sm">
                            Save {formatPrice(savings, { hideCurrencySymbol })}
                        </span>
                    </div>
                )}

                {/* View bundle CTA */}
                <button
                    className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-110 hover:opacity-90"
                    style={{ backgroundColor: branding.buttonPrimary }}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelect(bundle)
                    }}
                >
                    <span className="text-lg font-bold">+</span>
                </button>
            </div>

            {/* Content */}
            <div className="p-4">
                <h3
                    className="mb-1 text-lg font-bold line-clamp-1"
                    style={{ color: branding.cardTitle }}
                >
                    {bundle.name}
                </h3>

                {bundle.description && (
                    <p
                        className="mb-2 text-sm line-clamp-2"
                        style={{ color: branding.cardDescription }}
                    >
                        {bundle.description}
                    </p>
                )}

                {/* Items list */}
                <p
                    className="mb-2 text-xs line-clamp-1"
                    style={{ color: branding.textMuted }}
                >
                    {(bundle.items ?? [])
                        .map((bi) => {
                            const name = bi.menu_item?.name ?? 'Item'
                            return bi.quantity > 1 ? `${bi.quantity}× ${name}` : name
                        })
                        .join(' + ')}
                </p>

                {/* Price */}
                <div className="flex items-center gap-2">
                    {savings > 0 && (
                        <span
                            className="text-sm line-through"
                            style={{ color: branding.textMuted }}
                        >
                            {formatPrice(originalTotal, { hideCurrencySymbol })}
                        </span>
                    )}
                    <span
                        className="text-lg font-bold"
                        style={{ color: branding.cardPrice }}
                    >
                        {formatPrice(bundlePrice, { hideCurrencySymbol })}
                    </span>
                </div>

                <div className="mt-2">
                    <span
                        className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                        style={{
                            backgroundColor: branding.buttonSecondary,
                            color: branding.buttonSecondaryText,
                        }}
                    >
                        {(bundle.items ?? []).reduce((s, bi) => s + bi.quantity, 0)} items included
                    </span>
                </div>
            </div>
        </div>
    )
})
