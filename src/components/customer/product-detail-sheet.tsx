'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion'
import { ProductDetailContent } from './product-detail-content'
import {
    getProductDetailSettings,
    getProductDetailUpsells,
    type ProductDetailUpsells,
} from '@/app/actions/product-detail'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { MenuItem, Category, Tenant } from '@/types/database'
import type { BrandingColors } from '@/lib/branding-utils'
import type { SelectedTenant } from '@/lib/product-detail-data'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

interface ProductDetailSheetProps {
    open: boolean
    /** The tapped menu item. Held internally so it survives the close animation. */
    item: MenuItem | null
    onClose: () => void
    tenant: Tenant
    branding: BrandingColors
    /** Categories already loaded on the menu page (used to derive the active category + default add-ons). */
    categories: Category[]
    /** Full menu list already in memory — related items are derived from this, no fetch. */
    allMenuItems: MenuItem[]
    menuEngineeringEnabled?: boolean
    pairingRulesEnabled?: boolean
    bundlesEnabled?: boolean
    hideCurrencySymbol?: boolean
}

const EMPTY_UPSELLS: ProductDetailUpsells = {
    complementaryUpsells: [],
    upgradeUpsells: [],
    upsellBundles: [],
}

export function ProductDetailSheet({
    open,
    item,
    onClose,
    tenant,
    branding,
    categories,
    allMenuItems,
    menuEngineeringEnabled,
    pairingRulesEnabled,
    bundlesEnabled,
    hideCurrencySymbol,
}: ProductDetailSheetProps) {
    // The item currently shown in the sheet — swappable in-place via upgrade /
    // related-item selection without navigating routes.
    const [currentItem, setCurrentItem] = useState<MenuItem | null>(item)
    const [suppressAutoUpgrade, setSuppressAutoUpgrade] = useState(false)
    // Tenant-level theme settings — fetched once on mount (item-invariant) so the
    // theme is ready before the first open. Persists across item swaps.
    const [customization, setCustomization] = useState<ProductDetailSettings | null>(null)
    // Per-item upsells/bundles, with a loading flag so the post-add decision can
    // be deferred until they resolve.
    const [upsells, setUpsells] = useState<ProductDetailUpsells>(EMPTY_UPSELLS)
    const [upsellsLoading, setUpsellsLoading] = useState(false)
    const requestedItemRef = useRef<string | null>(null)
    const dragControls = useDragControls()

    useBodyScrollLock(open)

    // Pre-warm tenant-level theme settings once (the host mounts at menu load).
    useEffect(() => {
        if (!tenant.id) return
        let cancelled = false
        getProductDetailSettings(tenant.id)
            .then((settings) => {
                if (!cancelled && settings) setCustomization(settings)
            })
            .catch(() => {
                /* non-critical — falls back to branding-based theme */
            })
        return () => {
            cancelled = true
        }
    }, [tenant.id])

    // Seed/replace the current item when a new card is tapped. Guard on truthy so
    // closing (item -> null) keeps the last item visible through the exit animation.
    useEffect(() => {
        if (item) {
            setCurrentItem(item)
            setSuppressAutoUpgrade(false)
        }
    }, [item])

    // Escape to close.
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const hasUpsellFeatures = !!(menuEngineeringEnabled || pairingRulesEnabled || bundlesEnabled)

    // Lazy-fetch per-item upsells/bundles. Core UI is already rendered from the
    // in-memory menu data.
    useEffect(() => {
        if (!open || !currentItem) return
        const itemId = currentItem.id
        requestedItemRef.current = itemId
        // Clear stale upsells from the previously viewed item.
        setUpsells(EMPTY_UPSELLS)
        // No upsell features → nothing to fetch; don't make Add-to-Cart wait.
        if (!hasUpsellFeatures) {
            setUpsellsLoading(false)
            return
        }
        // Mark loading so a fast Add-to-Cart defers its post-add decision instead
        // of skipping it.
        setUpsellsLoading(true)
        let cancelled = false
        getProductDetailUpsells({
            tenantId: tenant.id,
            itemId,
            categoryId: currentItem.category_id,
            menuEngineeringEnabled,
            pairingRulesEnabled,
            bundlesEnabled,
        })
            .then((result) => {
                if (cancelled || requestedItemRef.current !== itemId) return
                setUpsells(result)
                setUpsellsLoading(false)
            })
            .catch(() => {
                if (cancelled || requestedItemRef.current !== itemId) return
                setUpsellsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, currentItem, tenant.id, hasUpsellFeatures, menuEngineeringEnabled, pairingRulesEnabled, bundlesEnabled])

    const category = useMemo(() => {
        if (!currentItem?.category_id) return null
        return categories.find((c) => c.id === currentItem.category_id) ?? null
    }, [categories, currentItem?.category_id])

    const relatedItems = useMemo(() => {
        if (!currentItem?.category_id) return []
        const currentId = currentItem.id
        const categoryId = currentItem.category_id
        return allMenuItems
            .filter((i) => i.category_id === categoryId && i.id !== currentId && i.is_available !== false)
            .slice(0, 4)
    }, [allMenuItems, currentItem?.category_id, currentItem?.id])

    const handleNavigateToItem = useCallback((next: MenuItem, opts?: { fromUpgrade?: boolean }) => {
        setCurrentItem(next)
        setSuppressAutoUpgrade(!!opts?.fromUpgrade)
    }, [])

    const handleDragEnd = useCallback(
        (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (info.offset.y > 120 || info.velocity.y > 600) {
                onClose()
            }
        },
        [onClose]
    )

    return (
        <AnimatePresence>
            {open && currentItem && (
                <motion.div className="fixed inset-0 z-[100]" key="product-detail-sheet">
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                    />

                    {/* Sheet panel — full-height slide-up (keeps in-content fixed
                        upsell takeovers covering the viewport). Centered + capped on
                        desktop. */}
                    <motion.div
                        className="absolute inset-x-0 bottom-0 top-0 mx-auto overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:top-6 sm:max-w-2xl"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                        drag="y"
                        dragListener={false}
                        dragControls={dragControls}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.4 }}
                        onDragEnd={handleDragEnd}
                    >
                        {/* Drag handle — swipe down to dismiss (drag starts here only,
                            so it never fights the scrollable content). */}
                        <div
                            className="absolute left-1/2 top-1.5 z-[60] -translate-x-1/2 touch-none cursor-grab px-10 py-1.5 active:cursor-grabbing"
                            onPointerDown={(e) => dragControls.start(e)}
                            aria-hidden="true"
                        >
                            <div className="h-1.5 w-10 rounded-full bg-black/20" />
                        </div>

                        <ProductDetailContent
                            key={currentItem.id}
                            mode="sheet"
                            tenant={tenant as unknown as SelectedTenant}
                            item={currentItem}
                            branding={branding}
                            category={category}
                            relatedItems={relatedItems}
                            customization={customization}
                            complementaryUpsells={upsells.complementaryUpsells}
                            upgradeUpsells={upsells.upgradeUpsells}
                            upsellBundles={upsells.upsellBundles}
                            menuEngineeringEnabled={menuEngineeringEnabled}
                            pairingRulesEnabled={pairingRulesEnabled}
                            bundlesEnabled={bundlesEnabled}
                            hideCurrencySymbol={hideCurrencySymbol}
                            isBrandAdmin={false}
                            suppressAutoUpgrade={suppressAutoUpgrade}
                            upsellsPending={upsellsLoading}
                            onClose={onClose}
                            onNavigateToItem={handleNavigateToItem}
                        />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
