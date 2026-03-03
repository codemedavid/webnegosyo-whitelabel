'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Package, Sparkles } from 'lucide-react'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithItems } from '@/lib/bundles-service'

interface BundleUpsellModalProps {
    open: boolean
    onClose: () => void
    onAccept: (bundle: BundleWithItems) => void
    bundle: BundleWithItems | null
    branding: BrandingColors
    tenantId?: string
    sourceItemId?: string
    hideCurrencySymbol?: boolean
}

const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
}

const modalVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, damping: 25, stiffness: 300 },
    },
    exit: { opacity: 0, y: 30, transition: { duration: 0.15 } },
}

/**
 * Lightweight upsell modal suggesting a bundle upgrade when a customer
 * adds a single item that belongs to an active bundle.
 * Shows the bundle preview with savings and a one-tap "Upgrade to Bundle" CTA.
 */
export const BundleUpsellModal = memo(function BundleUpsellModal({
    open,
    onClose,
    onAccept,
    bundle,
    branding,
    tenantId,
    sourceItemId,
    hideCurrencySymbol,
}: BundleUpsellModalProps) {
    const shownTrackedRef = useRef(false)

    useEffect(() => {
        if (open && tenantId && bundle && !shownTrackedRef.current) {
            shownTrackedRef.current = true
            trackAnalyticsEventAction(tenantId, 'upsell_shown', {
                source: 'bundle',
                bundleId: bundle.id,
                bundleName: bundle.name,
                sourceItemId,
            })
        }
        if (!open) {
            shownTrackedRef.current = false
        }
    }, [open, tenantId, bundle, sourceItemId])

    const handleAccept = useCallback(() => {
        if (bundle) {
            if (tenantId) {
                trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
                    source: 'bundle',
                    bundleId: bundle.id,
                    bundleName: bundle.name,
                    sourceItemId,
                })
            }
            onAccept(bundle)
        }
    }, [bundle, onAccept, tenantId, sourceItemId])

    if (!bundle) return null

    const items = bundle.items ?? []

    const originalTotal = items.reduce(
        (sum, bi) => sum + (bi.menu_item?.price ?? 0) * bi.quantity,
        0
    )

    const bundlePrice =
        bundle.pricing_type === 'fixed'
            ? bundle.fixed_price ?? 0
            : originalTotal * (1 - (bundle.discount_percent ?? 0) / 100)

    const savings = originalTotal - bundlePrice

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        onClick={onClose}
                    />
                    <motion.div
                        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                        variants={overlayVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                    >
                        <motion.div
                            className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
                            style={{ backgroundColor: branding.background }}
                            variants={modalVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div
                                className="relative px-5 pt-5 pb-4"
                                style={{
                                    background: `linear-gradient(135deg, ${branding.primary}15, ${branding.primary}05)`,
                                }}
                            >
                                <button
                                    onClick={onClose}
                                    className="absolute top-3 right-3 rounded-full p-1.5 transition-colors hover:bg-black/5"
                                    style={{ color: branding.textMuted }}
                                >
                                    <X className="h-4 w-4" />
                                </button>

                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="h-5 w-5" style={{ color: branding.primary }} />
                                    <p className="text-sm font-semibold" style={{ color: branding.primary }}>
                                        Bundle Deal Available!
                                    </p>
                                </div>
                                <h3 className="text-xl font-bold" style={{ color: branding.textPrimary }}>
                                    {bundle.name}
                                </h3>
                                {bundle.description && (
                                    <p className="text-sm mt-1" style={{ color: branding.textMuted }}>
                                        {bundle.description}
                                    </p>
                                )}
                            </div>

                            {/* Items preview */}
                            <div className="px-5 py-3 space-y-2">
                                {items.slice(0, 4).map((bi, idx) => (
                                    <div key={bi.menu_item_id ?? idx} className="flex items-center gap-3">
                                        {bi.menu_item?.image_url ? (
                                            <div className="relative h-10 w-10 rounded-lg overflow-hidden flex-shrink-0">
                                                <OptimizedImage
                                                    src={bi.menu_item.image_url}
                                                    alt={bi.menu_item.name}
                                                    fill
                                                    className="object-cover"
                                                    sizes="40px"
                                                    loading="lazy"
                                                />
                                            </div>
                                        ) : (
                                            <div
                                                className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                                                style={{ backgroundColor: `${branding.primary}10` }}
                                            >
                                                <Package className="h-4 w-4" style={{ color: branding.primary }} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium line-clamp-1" style={{ color: branding.textPrimary }}>
                                                {bi.quantity > 1 && `${bi.quantity}× `}{bi.menu_item?.name ?? 'Item'}
                                            </p>
                                        </div>
                                        <p className="text-sm" style={{ color: branding.textMuted }}>
                                            {formatPrice((bi.menu_item?.price ?? 0) * bi.quantity, { hideCurrencySymbol })}
                                        </p>
                                    </div>
                                ))}
                                {items.length > 4 && (
                                    <p className="text-xs pl-13" style={{ color: branding.textMuted }}>
                                        +{items.length - 4} more item{items.length - 4 > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            {/* CTA */}
                            <div className="px-5 pb-5 pt-2 space-y-3">
                                {/* Price comparison */}
                                <div
                                    className="flex items-center justify-between rounded-xl px-4 py-3"
                                    style={{ backgroundColor: `${branding.success || '#16a34a'}10` }}
                                >
                                    <div>
                                        <p className="text-xs" style={{ color: branding.textMuted }}>
                                            Individual total
                                        </p>
                                        <p className="text-sm line-through" style={{ color: branding.textMuted }}>
                                            {formatPrice(originalTotal, { hideCurrencySymbol })}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-medium" style={{ color: branding.success || '#16a34a' }}>
                                            Bundle price
                                        </p>
                                        <p className="text-lg font-bold" style={{ color: branding.success || '#16a34a' }}>
                                            {formatPrice(bundlePrice, { hideCurrencySymbol })}
                                        </p>
                                    </div>
                                </div>

                                {savings > 0 && (
                                    <p className="text-center text-sm font-medium" style={{ color: branding.success || '#16a34a' }}>
                                        Save {formatPrice(savings, { hideCurrencySymbol })} with this bundle!
                                    </p>
                                )}

                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex w-full items-center justify-center rounded-xl text-base font-semibold"
                                    style={{
                                        backgroundColor: branding.buttonPrimary,
                                        color: branding.buttonPrimaryText || '#fff',
                                        height: '48px',
                                        boxShadow: `0 4px 14px 0 color-mix(in srgb, ${branding.buttonPrimary} 30%, transparent)`,
                                    }}
                                    onClick={handleAccept}
                                >
                                    <Package className="mr-2 h-5 w-5" />
                                    Upgrade to Bundle
                                </motion.button>

                                <button
                                    className="w-full text-center text-sm py-1 transition-colors"
                                    style={{ color: branding.textMuted }}
                                    onClick={onClose}
                                >
                                    No thanks, continue
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
})
