import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { BundleWithSlots } from '@/types/database'

interface UseProductDetailModalsOptions {
    tenantSlug: string
    /**
     * When provided (sheet mode), this is called instead of router.back() when a
     * flow wants to dismiss the product detail (e.g. closing the post-add upsell
     * screen). In page mode this is omitted and navigation falls back to history.
     */
    onExit?: () => void
}

/**
 * Open/close state for the item page's overlays. The upgrade offer is no
 * longer one of them: it is part of the page (`ItemOffers`), where it used to
 * open itself as a full-screen takeover 200 ms after the product appeared.
 */
export function useProductDetailModals({
    tenantSlug,
    onExit,
}: UseProductDetailModalsOptions) {
    const router = useRouter()

    // Modal open states
    const [isImageModalOpen, setIsImageModalOpen] = useState(false)
    const [isPostAddUpsellOpen, setIsPostAddUpsellOpen] = useState(false)
    const [isPopupPreviewOpen, setIsPopupPreviewOpen] = useState(false)
    const [isCheckoutPreviewOpen, setIsCheckoutPreviewOpen] = useState(false)

    // Bundle states
    const [bundleForCustomization, setBundleForCustomization] = useState<BundleWithSlots | null>(null)

    // When true, navigating after upsell prompts goes to checkout instead of back to menu
    const buyNowIntentRef = useRef(false)

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
        isImageModalOpen,
        isPostAddUpsellOpen,
        setIsPostAddUpsellOpen,
        isPopupPreviewOpen,
        setIsPopupPreviewOpen,
        isCheckoutPreviewOpen,
        setIsCheckoutPreviewOpen,
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
