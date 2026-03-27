'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Package, Sparkles } from 'lucide-react'
import { formatPrice } from '@/lib/cart-utils'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import type { BrandingColors } from '@/lib/branding-utils'
import type { BundleWithSlots } from '@/types/database'

interface BundleUpsellModalProps {
    open: boolean
    onClose: () => void
    onAccept: (bundle: BundleWithSlots) => void
    bundle: BundleWithSlots | null
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
 * adds a single item whose category matches a bundle slot.
 * Shows the bundle slots as a preview with a one-tap "Upgrade to Bundle" CTA
 * that opens the slot-based bundle wizard.
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

    const handleDismiss = useCallback(() => {
        if (tenantId && bundle) {
            trackAnalyticsEventAction(tenantId, 'upsell_dismissed', {
                source: 'bundle',
                bundleId: bundle.id,
                bundleName: bundle.name,
                sourceItemId,
            })
        }
        onClose()
    }, [tenantId, bundle, sourceItemId, onClose])

    if (!bundle) return null

    const slots = bundle.slots ?? []

    // For discount bundles, show the slot count as a teaser (no item prices available yet)
    // For fixed bundles, just show the fixed price
    const bundlePrice = bundle.pricing_type === 'fixed' ? (bundle.fixed_price ?? 0) : null
    const discountPercent = bundle.pricing_type === 'discount' ? (bundle.discount_percent ?? 0) : null

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
                        onClick={handleDismiss}
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
                                    onClick={handleDismiss}
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

                            {/* Slots preview */}
                            <div className="px-5 py-3 space-y-2">
                                {slots.slice(0, 4).map((slot, idx) => (
                                    <div key={slot.id ?? idx} className="flex items-center gap-3">
                                        <div
                                            className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                                            style={{ backgroundColor: `${branding.primary}10` }}
                                        >
                                            <Package className="h-4 w-4" style={{ color: branding.primary }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium line-clamp-1" style={{ color: branding.textPrimary }}>
                                                {slot.name}
                                            </p>
                                            {slot.category?.name && (
                                                <p className="text-xs line-clamp-1" style={{ color: branding.textMuted }}>
                                                    {slot.pick_count > 1
                                                        ? `Choose ${slot.pick_count} from ${slot.category.name}`
                                                        : `Choose 1 from ${slot.category.name}`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {slots.length > 4 && (
                                    <p className="text-xs pl-13" style={{ color: branding.textMuted }}>
                                        +{slots.length - 4} more slot{slots.length - 4 > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            {/* CTA */}
                            <div className="px-5 pb-5 pt-2 space-y-3">
                                {/* Price info */}
                                <div
                                    className="flex items-center justify-center rounded-xl px-4 py-3"
                                    style={{ backgroundColor: `${branding.success || '#16a34a'}10` }}
                                >
                                    {bundlePrice !== null ? (
                                        <div className="text-center">
                                            <p className="text-xs font-medium" style={{ color: branding.success || '#16a34a' }}>
                                                Bundle price
                                            </p>
                                            <p className="text-lg font-bold" style={{ color: branding.success || '#16a34a' }}>
                                                {formatPrice(bundlePrice, { hideCurrencySymbol })}
                                            </p>
                                        </div>
                                    ) : discountPercent !== null && discountPercent > 0 ? (
                                        <div className="text-center">
                                            <p className="text-lg font-bold" style={{ color: branding.success || '#16a34a' }}>
                                                Save {discountPercent}% with this bundle!
                                            </p>
                                        </div>
                                    ) : null}
                                </div>

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
                                    onClick={handleDismiss}
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
