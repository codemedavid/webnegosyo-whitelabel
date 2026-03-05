'use client'

import { memo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem, UpgradeUpsell } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
}

const sheetVariants = {
    hidden: { y: '100%' },
    visible: {
        y: 0,
        transition: { type: 'spring' as const, damping: 28, stiffness: 350 },
    },
    exit: {
        y: '100%',
        transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' },
    },
}

interface InlineUpgradeSectionProps {
    open: boolean
    sourceItem: MenuItem
    upgrades: UpgradeUpsell[]
    bundles?: BundleWithItems[]
    onSelectUpgrade: (upgrade: UpgradeUpsell) => void
    onSelectBundle: (bundle: BundleWithItems) => void
    onDismiss: () => void
    hideCurrencySymbol?: boolean
    tenantId?: string
}

export const InlineUpgradeSection = memo(function InlineUpgradeSection({
    open,
    sourceItem,
    upgrades,
    bundles = [],
    onSelectUpgrade,
    onSelectBundle,
    onDismiss,
    hideCurrencySymbol,
    tenantId,
}: InlineUpgradeSectionProps) {
    const trackedRef = useRef(false)

    useEffect(() => {
        if (!open) { trackedRef.current = false; return }
        if (trackedRef.current || !tenantId || (upgrades.length === 0 && bundles.length === 0)) return
        trackedRef.current = true
        trackAnalyticsEventAction(tenantId, 'upsell_shown', {
            source: 'inline_upgrade', sourceItemId: sourceItem.id,
            upgradeCount: upgrades.length, bundleCount: bundles.length,
        })
    }, [open, tenantId, sourceItem.id, upgrades.length, bundles.length])

    useEffect(() => {
        if (open) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }
    }, [open])

    const header = upgrades[0]?.upgradeHeader || 'Would you like to make it a meal?'
    const sourceLabel = upgrades[0]?.sourceLabel || 'Ala Carte'
    const firstUpgrade = upgrades[0]
    const firstBundle = bundles[0]
    const target = firstUpgrade?.targetItem ?? firstBundle?.items?.[0]?.menu_item
    const targetLabel = firstUpgrade?.targetLabel || firstBundle?.name || 'Meal'
    const targetImage = target?.image_url ?? firstBundle?.image_url
    const sourcePrice = sourceItem.price

    const handleUpgrade = () => {
        if (firstUpgrade) {
            onSelectUpgrade(firstUpgrade)
            if (tenantId) trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
                source: 'inline_upgrade', type: 'upgrade', itemId: firstUpgrade.targetItem.id, sourceItemId: sourceItem.id,
            })
        } else if (firstBundle) {
            onSelectBundle(firstBundle)
            if (tenantId) trackAnalyticsEventAction(tenantId, 'upsell_clicked', {
                source: 'inline_upgrade', type: 'bundle', bundleId: firstBundle.id, sourceItemId: sourceItem.id,
            })
        }
    }

    const handleDismiss = () => {
        if (tenantId) trackAnalyticsEventAction(tenantId, 'upsell_dismissed', { source: 'inline_upgrade', sourceItemId: sourceItem.id })
        onDismiss()
    }

    return (
        <AnimatePresence>
            {open && (upgrades.length > 0 || bundles.length > 0) && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/50"
                        variants={backdropVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    />

                    {/* Sheet */}
                    <motion.div
                        className="fixed inset-0 z-50 flex flex-col bg-white"
                        variants={sheetVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        {/* Header area */}
                        <div className="flex-shrink-0 px-6 pt-8 pb-2">
                            <p className="text-sm text-gray-400 font-medium">{sourceItem.name}</p>
                            <h1 className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{header}</h1>
                        </div>

                        {/* Cards area */}
                        <div className="flex-1 flex items-center justify-center px-6">
                            <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                                {/* Ala Carte card */}
                                <button
                                    onClick={handleDismiss}
                                    className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center text-center transition-all active:scale-[0.97] active:bg-gray-50 shadow-sm"
                                >
                                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50">
                                        {sourceItem.image_url ? (
                                            <OptimizedImage src={sourceItem.image_url} alt={sourceLabel} fill className="object-contain p-2" sizes="40vw" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-gray-300 text-4xl">🍽</div>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 mt-3">No, {sourceLabel.toLowerCase()} only</p>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {formatPrice(sourcePrice, { hideCurrencySymbol })}
                                    </p>
                                </button>

                                {/* Upgrade/Meal card */}
                                <button
                                    onClick={handleUpgrade}
                                    className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center text-center transition-all active:scale-[0.97] active:bg-gray-50 shadow-sm"
                                >
                                    <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50">
                                        {targetImage ? (
                                            <OptimizedImage src={targetImage} alt={targetLabel} fill className="object-contain p-2" sizes="40vw" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-gray-300 text-4xl">🍽</div>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 mt-3">Yes, {targetLabel.toLowerCase()}</p>
                                </button>
                            </div>
                        </div>

                        {/* Cancel button at bottom */}
                        <div className="flex-shrink-0 px-6 pb-8 pt-4">
                            <button
                                onClick={handleDismiss}
                                className="w-full max-w-md mx-auto block h-12 rounded-lg border border-gray-300 text-sm font-medium text-gray-500 transition-colors active:bg-gray-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
})
