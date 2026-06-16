import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { BundleWithSlots } from '@/types/database'

interface UseProductDetailModalsOptions {
    tenantSlug: string
    menuEngineeringEnabled: boolean
    upgradeUpsellsCount: number
    upsellBundlesCount: number
    /**
     * When provided (sheet mode), this is called instead of router.back() when a
     * flow wants to dismiss the product detail (e.g. closing the post-add upsell
     * screen). In page mode this is omitted and navigation falls back to history.
     */
    onExit?: () => void
    /**
     * Suppress the auto-opening "Make it a Meal?" upgrade prompt. Used by the
     * bottom sheet after an in-sheet upgrade swap so the prompt doesn't re-fire.
     */
    suppressAutoUpgrade?: boolean
}

export function useProductDetailModals({
    tenantSlug,
    menuEngineeringEnabled,
    upgradeUpsellsCount,
    upsellBundlesCount,
    onExit,
    suppressAutoUpgrade = false,
}: UseProductDetailModalsOptions) {
    const router = useRouter()

    const [upgradeDismissed, setUpgradeDismissed] = useState(() =>
        typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('upgraded')
    )

    // Modal open states
    const [isImageModalOpen, setIsImageModalOpen] = useState(false)
    const [isPostAddUpsellOpen, setIsPostAddUpsellOpen] = useState(false)
    const [isPopupPreviewOpen, setIsPopupPreviewOpen] = useState(false)
    const [isCheckoutPreviewOpen, setIsCheckoutPreviewOpen] = useState(false)
    const [isUpgradeScreenOpen, setIsUpgradeScreenOpen] = useState(false)

    // Bundle states
    const [bundleForCustomization, setBundleForCustomization] = useState<BundleWithSlots | null>(null)

    // When true, navigating after upsell prompts goes to checkout instead of back to menu
    const buyNowIntentRef = useRef(false)

    // Auto-open the upgrade screen once -- skip if user already chose or dismissed
    // Brief delay so user sees the product detail page first
    useEffect(() => {
        if (upgradeDismissed || suppressAutoUpgrade) return
        if (menuEngineeringEnabled && (upgradeUpsellsCount > 0 || upsellBundlesCount > 0)) {
            const timer = setTimeout(() => setIsUpgradeScreenOpen(true), 200)
            return () => clearTimeout(timer)
        }
    }, [menuEngineeringEnabled, upgradeUpsellsCount, upsellBundlesCount, upgradeDismissed, suppressAutoUpgrade])

    // Image modal handlers
    const handleOpenImageModal = useCallback(() => {
        setIsImageModalOpen(true)
    }, [])

    const handleCloseImageModal = useCallback((open: boolean) => {
        setIsImageModalOpen(open)
    }, [])

    // Admin preview toggle handlers
    const handleTogglePopupPreview = useCallback(() => {
        setIsPopupPreviewOpen(prev => !prev)
    }, [])

    const handleToggleCheckoutPreview = useCallback(() => {
        setIsCheckoutPreviewOpen(prev => !prev)
    }, [])

    // Post-add upsell handler
    const handlePostAddUpsellClose = useCallback(() => {
        setIsPostAddUpsellOpen(false)
        if (buyNowIntentRef.current) {
            buyNowIntentRef.current = false
            router.push(`/${tenantSlug}/cart`)
        } else if (onExit) {
            // Sheet mode: close the sheet instead of popping history.
            onExit()
        } else {
            router.back()
        }
    }, [router, tenantSlug, onExit])

    // Navigate after buy-now intent when closing various modals
    const navigateAfterBuyNow = useCallback(() => {
        if (buyNowIntentRef.current) {
            buyNowIntentRef.current = false
            router.push(`/${tenantSlug}/cart`)
        }
    }, [router, tenantSlug])

    // Upsell item add handler (needs addItem from cart, so just expose the ref and state)

    return {
        // States
        upgradeDismissed,
        setUpgradeDismissed,
        isImageModalOpen,
        isPostAddUpsellOpen,
        setIsPostAddUpsellOpen,
        isPopupPreviewOpen,
        setIsPopupPreviewOpen,
        isCheckoutPreviewOpen,
        setIsCheckoutPreviewOpen,
        isUpgradeScreenOpen,
        setIsUpgradeScreenOpen,
        bundleForCustomization,
        setBundleForCustomization,
        buyNowIntentRef,

        // Handlers
        handleOpenImageModal,
        handleCloseImageModal,
        handleTogglePopupPreview,
        handleToggleCheckoutPreview,
        handlePostAddUpsellClose,
        navigateAfterBuyNow,
    }
}
