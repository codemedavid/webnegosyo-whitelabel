'use client'

import { memo } from 'react'
import { Package } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithSlots } from '@/types/database'

interface BundleCardProps {
    bundle: BundleWithSlots
    onSelect: (bundle: BundleWithSlots) => void
    branding: BrandingColors
    hideCurrencySymbol?: boolean
}

/**
 * Customer-facing bundle card — matches the visual language of menu item cards
 * with a distinct "bundle" identity (slot pills, savings badge).
 */
export const BundleCard = memo(function BundleCard({
    bundle,
    onSelect,
    branding,
    hideCurrencySymbol,
}: BundleCardProps) {
    const slots = bundle.slots ?? []

    // Compute cheapest item price per slot for a "Save up to X" calculation
    const minSlotTotal = slots.reduce((sum, slot) => {
        const items = slot.items ?? []
        if (items.length === 0) return sum
        const minPrice = Math.min(...items.map((i) => i.price ?? 0))
        return sum + minPrice * (slot.pick_count ?? 1)
    }, 0)

    const bundlePrice =
        bundle.pricing_type === 'fixed'
            ? (bundle.fixed_price ?? 0)
            : minSlotTotal * (1 - (bundle.discount_percent ?? 0) / 100)

    const savings = bundle.pricing_type === 'fixed'
        ? Math.max(0, minSlotTotal - bundlePrice)
        : Math.max(0, minSlotTotal - bundlePrice)

    // Show up to 4 slot category icons if no bundle image
    const slotIcons = slots
        .filter((s) => s.category?.icon)
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
            {/* Hero image or slot category icons */}
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
                ) : slotIcons.length > 0 ? (
                    <div className="grid grid-cols-2 h-full">
                        {slotIcons.map((slot, idx) => (
                            <div
                                key={slot.id ?? idx}
                                className="flex items-center justify-center text-3xl"
                                style={{ backgroundColor: `${branding.primary}${idx % 2 === 0 ? '12' : '08'}` }}
                            >
                                {slot.category?.icon ?? '🍱'}
                            </div>
                        ))}
                        {slotIcons.length < 4 &&
                            Array.from({ length: 4 - slotIcons.length }).map((_, i) => (
                                <div
                                    key={`placeholder-${i}`}
                                    className="flex items-center justify-center"
                                    style={{ backgroundColor: `${branding.primary}08` }}
                                >
                                    <Package className="h-6 w-6 opacity-30" style={{ color: branding.primary }} />
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
                            Save up to {formatPrice(savings, { hideCurrencySymbol })}
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

                {/* Slot pills */}
                {slots.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                        {slots.map((slot) => (
                            <span
                                key={slot.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                    backgroundColor: `${branding.primary}15`,
                                    color: branding.textSecondary,
                                }}
                            >
                                {slot.pick_count > 1
                                    ? `${slot.pick_count}× ${slot.category?.name || slot.name}`
                                    : (slot.category?.name || slot.name)}
                            </span>
                        ))}
                    </div>
                )}

                {/* Description (explicit or auto-generated from slots) */}
                {(bundle.description || slots.length > 0) && (
                    <p
                        className="mb-2 text-sm line-clamp-2"
                        style={{ color: branding.cardDescription }}
                    >
                        {bundle.description ||
                            slots
                                .map((s) => (s.pick_count > 1 ? `${s.pick_count}× ${s.name}` : s.name))
                                .join(' + ')}
                    </p>
                )}

                {/* Price */}
                <div className="flex items-center gap-2">
                    {bundle.pricing_type === 'fixed' ? (
                        <>
                            {savings > 0 && (
                                <span
                                    className="text-sm line-through"
                                    style={{ color: branding.textMuted }}
                                >
                                    {formatPrice(minSlotTotal, { hideCurrencySymbol })}
                                </span>
                            )}
                            <span
                                className="text-lg font-bold"
                                style={{ color: branding.cardPrice }}
                            >
                                {formatPrice(bundlePrice, { hideCurrencySymbol })}
                            </span>
                        </>
                    ) : (
                        <span
                            className="text-lg font-bold"
                            style={{ color: branding.cardPrice }}
                        >
                            {bundle.discount_percent
                                ? `${bundle.discount_percent}% off`
                                : 'Bundle Deal'}
                        </span>
                    )}
                </div>

                <div className="mt-2">
                    <span
                        className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                        style={{
                            backgroundColor: branding.buttonSecondary,
                            color: branding.buttonSecondaryText,
                        }}
                    >
                        {slots.length} slot{slots.length !== 1 ? 's' : ''} included
                    </span>
                </div>
            </div>
        </div>
    )
})
