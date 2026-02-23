'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Package, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { useCart } from '@/hooks/useCart'
import { toast } from 'sonner'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithItems } from '@/lib/bundles-service'
import type { MenuItem } from '@/types/database'

interface BundleCustomizationModalProps {
    open: boolean
    onClose: () => void
    bundle: BundleWithItems | null
    branding: BrandingColors
    hideCurrencySymbol?: boolean
}

interface ItemCustomization {
    selectedVariation?: { name: string; price_modifier: number; typeLabel: string }
    selectedAddons: { id: string; name: string; price: number }[]
}

const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
}

const sheetVariants = {
    hidden: { y: '100%' },
    visible: {
        y: 0,
        transition: { type: 'spring' as const, damping: 30, stiffness: 300 },
    },
    exit: { y: '100%', transition: { duration: 0.2 } },
}

const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
}

/**
 * Full-screen modal for customizing each item in a bundle before adding to cart.
 * Renders as bottom sheet on mobile, centered modal on desktop.
 */
export const BundleCustomizationModal = memo(function BundleCustomizationModal({
    open,
    onClose,
    bundle,
    branding,
    hideCurrencySymbol,
}: BundleCustomizationModalProps) {
    const { addItem } = useCart()
    const [expandedItemIdx, setExpandedItemIdx] = useState<number | null>(null)
    const [customizations, setCustomizations] = useState<Record<number, ItemCustomization>>({})

    // Reset state when bundle changes
    const bundleId = bundle?.id
    useMemo(() => {
        setCustomizations({})
        setExpandedItemIdx(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bundleId])

    const items = useMemo(() => bundle?.items ?? [], [bundle?.items])

    // Compute original total
    const originalTotal = items.reduce(
        (sum, bi) => sum + (bi.menu_item?.price ?? 0) * bi.quantity,
        0
    )

    // Bundle base price
    const bundleBasePrice =
        bundle?.pricing_type === 'fixed'
            ? bundle?.fixed_price ?? 0
            : originalTotal * (1 - (bundle?.discount_percent ?? 0) / 100)

    // Sum of customization extras
    const extrasTotal = Object.values(customizations).reduce((sum, c) => {
        const varMod = c.selectedVariation?.price_modifier ?? 0
        const addonSum = c.selectedAddons.reduce((s, a) => s + a.price, 0)
        return sum + varMod + addonSum
    }, 0)

    const grandTotal = bundleBasePrice + extrasTotal
    const savings = originalTotal - bundleBasePrice

    const bundleName = bundle?.name ?? ''

    const handleAddToCart = useCallback(() => {
        // For now, add each bundle item individually to the cart
        // A full cart integration would add the bundle as a single entity
        items.forEach((bi, idx) => {
            if (!bi.menu_item) return
            const cust = customizations[idx]
            const selectedVariation = cust?.selectedVariation
                ? {
                    id: `${cust.selectedVariation.typeLabel}-${cust.selectedVariation.name}`,
                    name: cust.selectedVariation.name,
                    price_modifier: cust.selectedVariation.price_modifier,
                }
                : undefined
            const selectedAddons = (cust?.selectedAddons ?? []).map((a) => ({
                id: a.id,
                name: a.name,
                price: a.price,
            }))
            addItem(
                bi.menu_item,
                selectedVariation,
                selectedAddons,
                bi.quantity,
                undefined
            )
        })

        toast.success(`Added ${bundleName} to cart`)
        onClose()
    }, [items, customizations, addItem, bundleName, onClose])

    if (!bundle) return null

    const toggleItemExpanded = (idx: number) => {
        setExpandedItemIdx(expandedItemIdx === idx ? null : idx)
    }

    const updateVariation = (
        idx: number,
        variation: { name: string; price_modifier: number; typeLabel: string } | undefined
    ) => {
        setCustomizations((prev) => ({
            ...prev,
            [idx]: {
                ...prev[idx],
                selectedVariation: variation,
                selectedAddons: prev[idx]?.selectedAddons ?? [],
            },
        }))
    }

    const toggleAddon = (idx: number, addon: { id: string; name: string; price: number }) => {
        setCustomizations((prev) => {
            const current = prev[idx]?.selectedAddons ?? []
            const exists = current.find((a) => a.id === addon.id)
            return {
                ...prev,
                [idx]: {
                    ...prev[idx],
                    selectedVariation: prev[idx]?.selectedVariation,
                    selectedAddons: exists
                        ? current.filter((a) => a.id !== addon.id)
                        : [...current, addon],
                },
            }
        })
    }

    const renderItemCustomization = (item: MenuItem, idx: number) => {
        const hasVariations =
            (item.variations?.length ?? 0) > 0 ||
            (item.variation_types?.length ?? 0) > 0
        const hasAddons = (item.addons?.length ?? 0) > 0

        if (!hasVariations && !hasAddons) {
            return (
                <p className="text-xs mt-1" style={{ color: branding.textMuted }}>
                    No customization needed
                </p>
            )
        }

        const cust = customizations[idx]

        return (
            <div className="mt-2 space-y-3">
                {/* Variation Types */}
                {item.variation_types?.map((vt) => (
                    <div key={vt.name}>
                        <p className="text-xs font-medium mb-1" style={{ color: branding.textSecondary }}>
                            {vt.name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {vt.options.map((opt) => {
                                const isSelected =
                                    cust?.selectedVariation?.name === opt.name &&
                                    cust?.selectedVariation?.typeLabel === vt.name
                                return (
                                    <button
                                        key={opt.name}
                                        type="button"
                                        className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
                                        style={{
                                            backgroundColor: isSelected ? branding.primary : 'transparent',
                                            color: isSelected ? (branding.buttonPrimaryText || '#fff') : branding.textSecondary,
                                            borderColor: isSelected ? branding.primary : branding.border,
                                        }}
                                        onClick={() =>
                                            updateVariation(
                                                idx,
                                                isSelected ? undefined : { name: opt.name, price_modifier: opt.price_modifier ?? 0, typeLabel: vt.name }
                                            )
                                        }
                                    >
                                        {opt.name}
                                        {(opt.price_modifier ?? 0) > 0 && ` (+${formatPrice(opt.price_modifier!, { hideCurrencySymbol })})`}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}

                {/* Legacy variations */}
                {!item.variation_types?.length && item.variations?.length > 0 && (
                    <div>
                        <p className="text-xs font-medium mb-1" style={{ color: branding.textSecondary }}>
                            Size
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {item.variations.map((v) => {
                                const isSelected = cust?.selectedVariation?.name === v.name
                                return (
                                    <button
                                        key={v.name}
                                        type="button"
                                        className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
                                        style={{
                                            backgroundColor: isSelected ? branding.primary : 'transparent',
                                            color: isSelected ? (branding.buttonPrimaryText || '#fff') : branding.textSecondary,
                                            borderColor: isSelected ? branding.primary : branding.border,
                                        }}
                                        onClick={() =>
                                            updateVariation(
                                                idx,
                                                isSelected ? undefined : { name: v.name, price_modifier: v.price_modifier ?? 0, typeLabel: 'Size' }
                                            )
                                        }
                                    >
                                        {v.name}
                                        {(v.price_modifier ?? 0) > 0 && ` (+${formatPrice(v.price_modifier!, { hideCurrencySymbol })})`}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Add-ons */}
                {hasAddons && (
                    <div>
                        <p className="text-xs font-medium mb-1" style={{ color: branding.textSecondary }}>
                            Add-ons
                        </p>
                        <div className="space-y-1">
                            {item.addons.map((addon) => {
                                const isSelected = cust?.selectedAddons?.some((a) => a.id === addon.id) ?? false
                                return (
                                    <button
                                        key={addon.id}
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs border transition-colors"
                                        style={{
                                            backgroundColor: isSelected ? `${branding.primary}10` : 'transparent',
                                            borderColor: isSelected ? branding.primary : branding.border,
                                            color: branding.textPrimary,
                                        }}
                                        onClick={() => toggleAddon(idx, { id: addon.id, name: addon.name, price: addon.price })}
                                    >
                                        <span>{addon.name}</span>
                                        <span style={{ color: branding.textMuted }}>
                                            +{formatPrice(addon.price, { hideCurrencySymbol })}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const content = (
        <>
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-2 shrink-0 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 pt-1 border-b shrink-0" style={{ borderColor: branding.border }}>
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5" style={{ color: branding.primary }} />
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: branding.textPrimary }}>
                            {bundle.name}
                        </h2>
                        <p className="text-xs" style={{ color: branding.textMuted }}>
                            Customize your items
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="rounded-full p-2 transition-colors hover:bg-black/5"
                    style={{ color: branding.textMuted }}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Scrollable items */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
                {items.map((bi, idx) => {
                    const item = bi.menu_item
                    if (!item) return null
                    const isExpanded = expandedItemIdx === idx
                    const hasCustomOptions =
                        (item.variations?.length ?? 0) > 0 ||
                        (item.variation_types?.length ?? 0) > 0 ||
                        (item.addons?.length ?? 0) > 0

                    return (
                        <div
                            key={`${bi.menu_item_id}-${idx}`}
                            className="rounded-xl border overflow-hidden"
                            style={{
                                borderColor: branding.border,
                                backgroundColor: branding.cards,
                            }}
                        >
                            <button
                                type="button"
                                className="w-full flex items-center gap-3 px-3 py-3 text-left"
                                onClick={() => hasCustomOptions && toggleItemExpanded(idx)}
                            >
                                {item.image_url && (
                                    <div className="relative h-14 w-14 rounded-lg overflow-hidden flex-shrink-0">
                                        <OptimizedImage
                                            src={item.image_url}
                                            alt={item.name}
                                            fill
                                            className="object-cover"
                                            sizes="56px"
                                            loading="lazy"
                                        />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold line-clamp-1" style={{ color: branding.cardTitle }}>
                                        {bi.quantity > 1 && `${bi.quantity}× `}{item.name}
                                    </p>
                                    <p className="text-xs" style={{ color: branding.textMuted }}>
                                        {formatPrice(item.price, { hideCurrencySymbol })}
                                        {customizations[idx]?.selectedVariation && (
                                            <> · {customizations[idx].selectedVariation!.name}</>
                                        )}
                                        {(customizations[idx]?.selectedAddons?.length ?? 0) > 0 && (
                                            <> · {customizations[idx].selectedAddons.length} add-on{customizations[idx].selectedAddons.length !== 1 ? 's' : ''}</>
                                        )}
                                    </p>
                                </div>
                                {hasCustomOptions && (
                                    isExpanded ? (
                                        <ChevronUp className="h-4 w-4 flex-shrink-0" style={{ color: branding.textMuted }} />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: branding.textMuted }} />
                                    )
                                )}
                            </button>

                            {isExpanded && (
                                <div className="px-3 pb-3 border-t" style={{ borderColor: branding.border }}>
                                    {renderItemCustomization(item, idx)}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div
                className="px-4 pt-3 pb-5 shrink-0 border-t"
                style={{ backgroundColor: branding.cards, borderColor: branding.border }}
            >
                {/* Price summary */}
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-sm font-medium" style={{ color: branding.textPrimary }}>
                            Total
                        </p>
                        {savings > 0 && (
                            <p className="text-xs" style={{ color: branding.success || '#16a34a' }}>
                                You save {formatPrice(savings, { hideCurrencySymbol })}
                            </p>
                        )}
                    </div>
                    <p className="text-xl font-bold" style={{ color: branding.textPrimary }}>
                        {formatPrice(grandTotal, { hideCurrencySymbol })}
                    </p>
                </div>

                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex w-full items-center justify-center rounded-xl text-base font-semibold"
                    style={{
                        backgroundColor: branding.buttonPrimary,
                        color: branding.buttonPrimaryText || '#fff',
                        height: '52px',
                        boxShadow: `0 6px 20px 0 color-mix(in srgb, ${branding.buttonPrimary} 38%, transparent)`,
                    }}
                    onClick={handleAddToCart}
                >
                    <ShoppingBag className="mr-2 h-5 w-5" />
                    Add Bundle to Cart
                </motion.button>
            </div>
        </>
    )

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Mobile: bottom sheet */}
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm sm:hidden"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        onClick={onClose}
                    />
                    <motion.div
                        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl sm:hidden"
                        style={{ backgroundColor: branding.background, maxHeight: '90vh' }}
                        variants={sheetVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        {content}
                    </motion.div>

                    {/* Desktop: centered modal */}
                    <motion.div
                        className="fixed inset-0 z-50 hidden items-center justify-center sm:flex p-4"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                    >
                        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
                        <motion.div
                            className="relative flex flex-col rounded-2xl w-full max-w-lg overflow-hidden shadow-xl"
                            style={{ backgroundColor: branding.background, maxHeight: '85vh' }}
                            variants={modalVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            {content}
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
})
