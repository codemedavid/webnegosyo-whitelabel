'use client'

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { ChevronLeft, Minus, Plus, Share2, UtensilsCrossed, Flame, Leaf, WheatOff, Heart, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { useVariationState } from '@/hooks/useVariationState'
import { useProductDetailModals } from '@/hooks/useProductDetailModals'
import { formatPrice } from '@/lib/cart-utils'
import { toast } from 'sonner'
import type { MenuItem, Variation, Addon, VariationOption, Category, UpgradeUpsell } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'
import type { BrandingColors } from '@/lib/branding-utils'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import type { BundleWithSlots } from '@/types/database'
import { mergeSettingsWithBranding, getProductDetailThemeCSS, computeProductDetailStyles } from '@/lib/product-detail-theme'
import { transformCloudinaryUrl, isCloudinaryUrl } from '@/lib/cloudinary-utils'
import dynamic from 'next/dynamic'
import { LazyImageModal, LazyProductDetailCustomizer, LazyRelatedItemsSection } from './product-detail-lazy'
import { motion } from 'framer-motion'
const InlineUpgradeSection = dynamic(
  () => import('./inline-upgrade-section').then((m) => ({ default: m.InlineUpgradeSection })),
  { ssr: false }
)

// Upsell/checkout modals — not visible on initial render; lazy-load them.
const PostAddUpsellScreen = dynamic(
  () => import('@/components/customer/post-add-upsell-screen').then((m) => ({ default: m.PostAddUpsellScreen })),
  { ssr: false }
)
const UpsellSuggestionModal = dynamic(
  () => import('./upsell-suggestion-modal').then((m) => ({ default: m.UpsellSuggestionModal })),
  { ssr: false }
)
const CheckoutUpsellModal = dynamic(
  () => import('./checkout-upsell-modal').then((m) => ({ default: m.CheckoutUpsellModal })),
  { ssr: false }
)
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)

interface ProductDetailContentProps {
    tenant: SelectedTenant
    item: MenuItem
    branding: BrandingColors
    category?: Category | null
    relatedItems?: MenuItem[]
    customization?: ProductDetailSettings | null
    complementaryUpsells?: MenuItem[]
    upgradeUpsells?: UpgradeUpsell[]
    menuEngineeringEnabled?: boolean
    hideCurrencySymbol?: boolean
    upsellBundles?: BundleWithSlots[]
    bundlesEnabled?: boolean
    isBrandAdmin?: boolean
}

interface ProductDetailCustomizerOpenDetail {
    tab?: 'colors' | 'typography' | 'layout'
    section?: 'header' | 'image' | 'product_info' | 'variations' | 'addons' | 'related_items' | 'footer_summary' | 'footer_buttons'
    pane?: 'palette' | 'settings'
}

interface AdminEditPencilProps {
    visible: boolean
    onClick: () => void
    label: string
    className?: string
}

const AdminEditPencil = memo(function AdminEditPencil({ visible, onClick, label, className }: AdminEditPencilProps) {
    if (!visible) return null

    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition-colors hover:bg-white hover:text-gray-900 ${className || ''}`}
        >
            <Pencil className="h-3.5 w-3.5" />
        </button>
    )
})

// Memoized Dietary Tag Component
interface DietaryTagProps {
    label: string
    icon: React.ElementType
}

const DietaryTag = memo(function DietaryTag({ label, icon: Icon }: DietaryTagProps) {
    return (
        <Badge
            variant="outline"
            className="flex items-center gap-1 px-2 py-1 text-xs"
            style={{
                borderColor: 'var(--pd-dietary-tag-border)',
                color: 'var(--pd-dietary-tag-text)',
                backgroundColor: 'var(--pd-dietary-tag-bg)'
            }}
        >
            <Icon className="h-3 w-3" />
            {label}
        </Badge>
    )
})

// Memoized Variation Option Button Component
interface VariationOptionButtonProps {
    option: VariationOption
    isSelected: boolean
    onSelect: () => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
    showUpgradeNudge?: boolean
    currentPriceModifier?: number
}

const VariationOptionButton = memo(function VariationOptionButton({
    option,
    isSelected,
    onSelect,
    dynamicStyles,
    showUpgradeNudge,
    currentPriceModifier = 0,
}: VariationOptionButtonProps) {
    const upgradeAmount = option.price_modifier - currentPriceModifier
    return (
        <button
            type="button"
            onClick={onSelect}
            className="px-4 py-2.5 text-sm font-medium transition-all duration-150 border active:scale-[0.95]"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
        >
            <span className="font-semibold">{option.name}</span>
            {option.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
                    (+{formatPrice(option.price_modifier)})
                </span>
            )}
            {showUpgradeNudge && !isSelected && option.is_upgrade_target && upgradeAmount > 0 && (
                <span
                    className="ml-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                        backgroundColor: 'var(--pd-button-primary, var(--button-primary))',
                        color: 'var(--pd-button-primary-text, #fff)',
                        opacity: 0.85,
                    }}
                >
                    Upgrade +{formatPrice(upgradeAmount)}
                </span>
            )}
        </button>
    )
})

// Memoized Legacy Variation Button Component
interface LegacyVariationButtonProps {
    variation: Variation
    isSelected: boolean
    onSelect: () => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
}

const LegacyVariationButton = memo(function LegacyVariationButton({
    variation,
    isSelected,
    onSelect,
    dynamicStyles
}: LegacyVariationButtonProps) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="px-4 py-2.5 text-sm font-medium transition-all duration-150 border active:scale-[0.95]"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
        >
            <span className="font-semibold">{variation.name}</span>
            {variation.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
                    (+{formatPrice(variation.price_modifier)})
                </span>
            )}
        </button>
    )
})

// Memoized Addon Button Component
interface AddonButtonProps {
    addon: Addon
    isSelected: boolean
    onToggle: () => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
    freeText: string
}

const AddonButton = memo(function AddonButton({
    addon,
    isSelected,
    onToggle,
    dynamicStyles,
    freeText,
}: AddonButtonProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between p-3.5 border-2 transition-all duration-150 active:scale-[0.98]"
            style={isSelected ? dynamicStyles?.addonButtonSelected : dynamicStyles?.addonButton}
        >
            <div className="flex items-center gap-3">
                <div
                    className="h-5 w-5 rounded border-2 flex items-center justify-center transition-all"
                    style={isSelected ? {
                        borderColor: 'var(--pd-addon-check)',
                        backgroundColor: 'var(--pd-addon-check)'
                    } : {
                        borderColor: 'var(--pd-addon-border)'
                    }}
                >
                    {isSelected && (
                        <svg className="h-3 w-3" style={{ color: 'var(--pd-addon-selected-text)' }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    )}
                </div>
                <span
                    className="text-sm font-medium"
                    style={{ color: isSelected ? 'var(--pd-addon-selected-text)' : 'var(--pd-addon-text)' }}
                >
                    {addon.name}
                </span>
            </div>
            <span
                className="text-sm font-semibold"
                style={{ color: isSelected ? 'var(--pd-addon-selected-text)' : 'var(--pd-addon-price)' }}
            >
                {addon.price === 0 ? freeText : `+${formatPrice(addon.price)}`}
            </span>
        </button>
    )
})



export const ProductDetailContent = memo(function ProductDetailContent({
    tenant,
    item,
    branding,
    category,
    relatedItems = [],
    customization = null,
    complementaryUpsells = [],
    upgradeUpsells = [],
    menuEngineeringEnabled = false,
    hideCurrencySymbol,
    upsellBundles = [],
    bundlesEnabled = false,
    isBrandAdmin = false,
}: ProductDetailContentProps) {
    const router = useRouter()
    const { addItem, setTenantContext } = useCart()
    const mainContentRef = useRef<HTMLElement | null>(null)
    const [isPageTransitioning, setIsPageTransitioning] = useState(false)
    const pendingNavigationRef = useRef<string | null>(null)
    const [customizationDraft, setCustomizationDraft] = useState<Partial<ProductDetailSettings> | null>(null)

    const {
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
        handleOpenImageModal,
        handleCloseImageModal,
        handleTogglePopupPreview,
        handleToggleCheckoutPreview,
        handlePostAddUpsellClose,
    } = useProductDetailModals({
        tenantSlug: tenant.slug,
        menuEngineeringEnabled,
        upgradeUpsellsCount: upgradeUpsells.length,
        upsellBundlesCount: upsellBundles.length,
    })

    // Eager-preload upsell modal bundles so they're ready when triggered
    useEffect(() => {
        import('./inline-upgrade-section')
        import('./post-add-upsell-screen')
        import('@/components/customer/bundle-wizard')
        import('@/components/customer/checkout-upsell-modal')
    }, [])

    const {
        selectedVariation,
        selectedVariations,
        selectedAddons,
        quantity,
        useNewVariations,
        hasVariations,
        hasVariationTypes,
        hasAddons,
        hasCustomizations,
        hasDiscount,
        totalPrice,
        mergedAddons,
        handleVariationTypeSelect,
        handleLegacyVariationSelect,
        toggleAddon,
        handleDecreaseQuantity,
        handleIncreaseQuantity,
    } = useVariationState({ item, category })

    // Merge customization settings with branding
    const activeCustomization = customizationDraft || customization

    const themeColors = useMemo(() => {
        // Cast to expected type - draft may be Partial but merge function handles null
        return mergeSettingsWithBranding(activeCustomization as ProductDetailSettings | null, branding)
    }, [activeCustomization, branding])

    const cssVariables = useMemo(() => {
        const vars = getProductDetailThemeCSS(themeColors)
        // Ensure all values are valid CSS strings
        return Object.fromEntries(
            Object.entries(vars).map(([key, value]) => [key, value ?? ''])
        ) as React.CSSProperties
    }, [themeColors])

    const dynamicStyles = useMemo(() => {
        return computeProductDetailStyles(themeColors)
    }, [themeColors])

    const openBrandingEditor = useCallback((
        section: NonNullable<ProductDetailCustomizerOpenDetail['section']>,
        pane: NonNullable<ProductDetailCustomizerOpenDetail['pane']> = 'palette'
    ) => {
        window.dispatchEvent(new CustomEvent<ProductDetailCustomizerOpenDetail>('product-detail-customizer:open', {
            detail: { section, pane },
        }))
    }, [])

    // Debug logging in development
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('ProductDetailContent mounted:', {
                itemName: item.name,
                variationsCount: item.variations?.length || 0,
                variationTypesCount: item.variation_types?.length || 0,
                addonsCount: item.addons?.length || 0,
                relatedItemsCount: relatedItems?.length || 0,
                hasCustomization: !!customization
            })
        }
    }, [item, relatedItems, customization])

    // Note: Animation config can be added here if needed for custom animations

    // Set tenant context for cart
    useEffect(() => {
        setTenantContext(tenant.id, tenant.slug)
    }, [tenant.id, tenant.slug, setTenantContext])

    // Preload upgrade upsell images so they're in the browser cache when the modal opens
    useEffect(() => {
        if (!menuEngineeringEnabled || upgradeUpsells.length === 0) return

        const imageUrls: string[] = []
        const targetImage = upgradeUpsells[0]?.targetItem?.image_url
        const sourceImage = item.image_url

        for (const url of [sourceImage, targetImage]) {
            if (!url) continue
            // Match the transform the OptimizedImage component will use: fill mode, sizes="96px" → 96px * 2 = 192px
            if (isCloudinaryUrl(url)) {
                const transformed = transformCloudinaryUrl(url, {
                    width: 192,
                    height: 192,
                    quality: 'auto',
                    crop: 'fill',
                })
                if (transformed) imageUrls.push(transformed)
            } else {
                imageUrls.push(url)
            }
        }

        for (const src of imageUrls) {
            const img = new window.Image()
            img.src = src
        }
    }, [menuEngineeringEnabled, upgradeUpsells, item.image_url])

    useEffect(() => {
        if (process.env.NODE_ENV !== 'test') {
            try {
                window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
            } catch {
                document.documentElement.scrollTop = 0
                document.body.scrollTop = 0
            }
        } else {
            document.documentElement.scrollTop = 0
            document.body.scrollTop = 0
        }

        const main = mainContentRef.current
        if (!main) return

        if (typeof main.scrollTo === 'function') {
            try {
                main.scrollTo({ top: 0, left: 0, behavior: 'auto' })
                return
            } catch {
                // Fall through to direct property assignment.
            }
        }

        main.scrollTop = 0
        main.scrollLeft = 0
    }, [item.id])

    useEffect(() => {
        if (isPageTransitioning && pendingNavigationRef.current) {
            const timer = setTimeout(() => {
                const url = pendingNavigationRef.current!
                pendingNavigationRef.current = null
                setIsPageTransitioning(false)
                router.replace(url)
            }, 250) // Match the exit animation duration
            return () => clearTimeout(timer)
        }
    }, [isPageTransitioning, router])

    const hasImage = useMemo(() =>
        item.image_url && item.image_url.trim() !== '',
        [item.image_url]
    )

    const dietaryTags = useMemo(() => {
        const tags: Array<{ label: string; icon: React.ElementType }> = []
        const text = `${item.name} ${item.description}`.toLowerCase()

        if (text.includes('vegetarian') || text.includes('veg')) {
            tags.push({ label: 'Vegetarian', icon: Leaf })
        }
        if (text.includes('vegan')) {
            tags.push({ label: 'Vegan', icon: Leaf })
        }
        if (text.includes('spicy') || text.includes('hot') || text.includes('chili')) {
            tags.push({ label: 'Spicy', icon: Flame })
        }
        if (text.includes('gluten-free') || text.includes('gluten free')) {
            tags.push({ label: 'Gluten-Free', icon: WheatOff })
        }
        if (text.includes('healthy') || text.includes('low-cal')) {
            tags.push({ label: 'Healthy', icon: Heart })
        }

        return tags
    }, [item.name, item.description])

    // Memoized event handlers
    const handleGoBack = useCallback(() => {
        router.back()
    }, [router])

    const handleGoHome = useCallback(() => {
        router.push(`/${tenant.slug}`)
    }, [router, tenant.slug])

    const handleGoMenu = useCallback(() => {
        router.push(`/${tenant.slug}/menu`)
    }, [router, tenant.slug])

    // Generate selected summary text - memoized
    const getSelectedSummary = useMemo(() => {
        const parts: string[] = []

        if (useNewVariations && item.variation_types) {
            item.variation_types.forEach(type => {
                const selected = selectedVariations[type.id]
                if (selected) {
                    parts.push(selected.name)
                }
            })
        } else if (selectedVariation) {
            parts.push(selectedVariation.name)
        }

        if (selectedAddons.length > 0) {
            parts.push(...selectedAddons.map(a => a.name))
        }

        return parts.length > 0 ? parts.join(', ') : themeColors.footerEmptySummaryText
    }, [useNewVariations, item.variation_types, selectedVariations, selectedVariation, selectedAddons, themeColors.footerEmptySummaryText])

    // Helper to add the current item to cart with current selections
    const addCurrentItemToCart = useCallback(() => {
        const variationData = useNewVariations ? selectedVariations : selectedVariation
        addItem(item, variationData, selectedAddons, quantity)
        toast.success(`Added ${item.name} to cart`)
    }, [useNewVariations, item, selectedVariations, selectedVariation, selectedAddons, quantity, addItem])

    const matchingBundle = useMemo(() => {
        if (!bundlesEnabled || !upsellBundles?.length) return null
        return upsellBundles.find((b) =>
            b.slots.some((s) => s.category_id === item.category_id)
        ) ?? null
    }, [bundlesEnabled, upsellBundles, item.category_id])

    const handleAddToCart = useCallback((skipNavigation = false) => {
        // Check if required variation types have selections
        if (useNewVariations && item.variation_types) {
            const missingRequired = item.variation_types.find(
                type => type.is_required && !selectedVariations[type.id]
            )
            if (missingRequired) {
                toast.error(`Please select ${missingRequired.name}`)
                return
            }
        }

        // Add the item to cart
        addCurrentItemToCart()

        // Check if any upsell data exists
        const hasSuggestions = menuEngineeringEnabled && complementaryUpsells && complementaryUpsells.length > 0
        const hasBundle = bundlesEnabled && matchingBundle !== null

        if (!skipNavigation && (hasSuggestions || hasBundle)) {
            // Open unified upsell screen
            setIsPostAddUpsellOpen(true)
            return
        }

        // No upsells — navigate directly
        if (!skipNavigation) {
            if (buyNowIntentRef.current) {
                buyNowIntentRef.current = false
                router.push(`/${tenant.slug}/cart`)
            } else {
                router.back()
            }
        }
    }, [useNewVariations, item, selectedVariations, addCurrentItemToCart, router, menuEngineeringEnabled, complementaryUpsells, bundlesEnabled, matchingBundle, tenant.slug, buyNowIntentRef, setIsPostAddUpsellOpen])

    const handleBuyNow = useCallback(() => {
        buyNowIntentRef.current = true
        handleAddToCart(false) // Go through full upsell flow; navigateAfterUpsells handles checkout redirect
    }, [handleAddToCart, buyNowIntentRef])

    const handleShare = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success('Link copied!')
        } catch {
            toast.error('Failed to copy link')
        }
    }, [])

    return (
        <motion.div
            animate={isPageTransitioning ? { x: '-100%', opacity: 0 } : { x: 0, opacity: 1 }}
            transition={{ type: 'tween' as const, duration: 0.25, ease: 'easeInOut' as const }}
            className="min-h-screen flex flex-col"
            style={cssVariables}
        >
            {/* Back Navigation */}
            <header className="fixed top-0 left-0 right-0 z-50 p-3" style={{ backgroundColor: 'var(--pd-header-background)' }}>
                <div className="flex items-center justify-between gap-2">
                    <motion.button
                        onClick={handleGoBack}
                        className="rounded-full p-2 shadow-md transition-colors"
                        style={{
                            backgroundColor: 'var(--pd-header-button-bg)',
                        }}
                        aria-label="Go back"
                        whileTap={{ scale: 0.95 }}
                    >
                        <ChevronLeft className="h-6 w-6" style={{ color: 'var(--pd-header-button-icon)' }} />
                    </motion.button>
                    <motion.button
                        onClick={handleShare}
                        className="rounded-full p-2 shadow-md transition-colors"
                        style={{ backgroundColor: 'var(--pd-header-button-bg)' }}
                        aria-label="Share"
                        whileTap={{ scale: 0.95 }}
                    >
                        <Share2 className="h-5 w-5" style={{ color: 'var(--pd-header-button-icon)' }} />
                    </motion.button>
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => openBrandingEditor('header')}
                        label="Edit header branding"
                    />
                </div>
            </header>

            {/* Main Content - Scrollable */}
            <main ref={mainContentRef} className="flex-1 overflow-y-auto pb-40" style={{ backgroundColor: 'var(--pd-page-background)' }}>
                {/* Product Image - Hero */}
                <div
                    className="relative w-full h-[50vh]"
                    style={{
                        backgroundColor: 'var(--pd-image-background)',
                        ...(hasImage && item.image_url && isCloudinaryUrl(item.image_url) ? {
                            backgroundImage: `url(${transformCloudinaryUrl(item.image_url, { width: 40, quality: 1, crop: 'limit' }) || ''})`,
                            backgroundSize: 'contain',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat',
                        } : {}),
                    }}
                >
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => openBrandingEditor('image')}
                        label="Edit image and badge branding"
                        className="absolute left-4 top-4 z-20"
                    />
                    {hasImage ? (
                        <button
                            onClick={handleOpenImageModal}
                            className="w-full h-full relative"
                        >
                            <OptimizedImage
                                src={item.image_url}
                                alt={item.name}
                                fill
                                className="object-contain"
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
                                priority
                            />
                        </button>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--pd-image-background)' }}>
                            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--pd-qty-bg)' }}>
                                <UtensilsCrossed className="h-10 w-10" style={{ color: 'var(--pd-image-placeholder)' }} />
                            </div>
                        </div>
                    )}
                    {hasDiscount && (
                        <div
                            className="absolute top-4 right-4 px-3 py-1 rounded-full text-sm font-semibold shadow-lg"
                            style={{
                                backgroundColor: 'var(--pd-sale-badge-bg)',
                                color: 'var(--pd-sale-badge-text)'
                            }}
                        >
                            Sale
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="relative px-5 py-6" style={{ padding: 'var(--pd-section-padding)' }}>
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => openBrandingEditor('product_info', 'settings')}
                        label="Edit product text branding"
                        className="absolute right-0 top-0"
                    />
                    {/* Breadcrumbs */}
                    <nav className="mb-4">
                        <ol className="flex items-center gap-1.5 text-sm flex-wrap">
                            <li>
                                <button
                                    onClick={handleGoHome}
                                    className="hover:underline transition-colors"
                                    style={{ color: 'var(--pd-breadcrumb)' }}
                                >
                                    Home
                                </button>
                            </li>
                            <li style={{ color: 'var(--pd-text-muted)' }}>/</li>
                            <li>
                                <button
                                    onClick={handleGoMenu}
                                    className="hover:underline transition-colors"
                                    style={{ color: 'var(--pd-breadcrumb)' }}
                                >
                                    Menu
                                </button>
                            </li>
                            {category && (
                                <>
                                    <li style={{ color: 'var(--pd-text-muted)' }}>/</li>
                                    <li style={{ color: 'var(--pd-breadcrumb-active)' }}>{category.name}</li>
                                </>
                            )}
                            <li style={{ color: 'var(--pd-text-muted)' }}>/</li>
                            <li style={{ color: 'var(--pd-text-muted)' }} className="truncate max-w-[120px]">
                                {item.name}
                            </li>
                        </ol>
                    </nav>

                    {/* Name & Meta */}
                    <div className="text-center mb-4">
                        <h1
                            className="mb-2"
                            style={dynamicStyles?.name}
                        >
                            {item.name}
                        </h1>

                        {/* Dietary Tags */}
                        {dietaryTags.length > 0 && (
                            <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
                                {dietaryTags.map((tag) => (
                                    <DietaryTag
                                        key={tag.label}
                                        label={tag.label}
                                        icon={tag.icon}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Size/Calories info - if available */}
                        {item.variations.length > 0 && (
                            <p className="text-sm" style={{ color: 'var(--pd-text-muted)' }}>
                                {item.variations.map(v => v.name).join(' • ')}
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    {item.description && (
                        <p
                            className="text-center leading-relaxed mb-6"
                            style={dynamicStyles?.description}
                        >
                            {item.description}
                        </p>
                    )}

                    {/* Divider */}
                    {hasCustomizations && (
                        <div className="border-t mb-6" style={{ borderColor: 'var(--pd-border)' }} />
                    )}

                    {/* Variation Types (New System) */}
                    {hasVariationTypes && item.variation_types && item.variation_types.map((variationType) => {
                        const selectedOption = selectedVariations[variationType.id]

                        return (
                            <div
                                key={variationType.id}
                                className="mb-6"
                            >
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <h3
                                            className="text-base font-semibold"
                                            style={{
                                                color: 'var(--pd-variation-title)',
                                                fontSize: 'var(--pd-variation-title-font-size)'
                                            }}
                                        >
                                            {variationType.name}
                                        </h3>
                                        <span
                                            className="text-xs font-medium px-2 py-0.5 rounded"
                                            style={{ color: 'var(--pd-variation-required)' }}
                                        >
                                            {variationType.is_required ? themeColors.variationRequiredText : themeColors.variationOptionalText}
                                        </span>
                                    </div>
                                    <AdminEditPencil
                                        visible={isBrandAdmin}
                                        onClick={() => openBrandingEditor('variations')}
                                        label="Edit variation selector branding"
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {variationType.options.map((option) => (
                                        <VariationOptionButton
                                            key={option.id}
                                            option={option}
                                            isSelected={selectedOption?.id === option.id}
                                            onSelect={() => handleVariationTypeSelect(variationType.id, option)}
                                            dynamicStyles={dynamicStyles}
                                            showUpgradeNudge={menuEngineeringEnabled}
                                            currentPriceModifier={selectedOption?.price_modifier ?? 0}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}

                    {/* Legacy Variations */}
                    {!useNewVariations && hasVariations && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <h3
                                        className="text-base font-semibold"
                                        style={{
                                            color: 'var(--pd-variation-title)',
                                            fontSize: 'var(--pd-variation-title-font-size)'
                                        }}
                                    >
                                        Choose Size
                                    </h3>
                                    <span
                                        className="text-xs font-medium px-2 py-0.5 rounded"
                                        style={{ color: 'var(--pd-variation-required)' }}
                                    >
                                        {themeColors.variationRequiredText}
                                    </span>
                                </div>
                                <AdminEditPencil
                                    visible={isBrandAdmin}
                                    onClick={() => openBrandingEditor('variations')}
                                    label="Edit variation selector branding"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {item.variations.map((variation) => (
                                    <LegacyVariationButton
                                        key={variation.id}
                                        variation={variation}
                                        isSelected={selectedVariation?.id === variation.id}
                                        onSelect={() => handleLegacyVariationSelect(variation)}
                                        dynamicStyles={dynamicStyles}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add-ons */}
                    {hasAddons && (
                        <div className="mb-6">
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <h3
                                    className="text-base font-semibold"
                                    style={{
                                        color: 'var(--pd-addon-title)',
                                        fontSize: 'var(--pd-addon-title-font-size)'
                                    }}
                                >
                                    Add-ons <span style={{ color: 'var(--pd-text-muted)' }} className="font-normal text-xs">{themeColors.addonOptionalText}</span>
                                </h3>
                                <AdminEditPencil
                                    visible={isBrandAdmin}
                                    onClick={() => openBrandingEditor('addons')}
                                    label="Edit add-ons branding"
                                />
                            </div>

                            <div className="space-y-2">
                                {mergedAddons.map((addon) => (
                                    <AddonButton
                                        key={addon.id}
                                        addon={addon}
                                        isSelected={selectedAddons.some((a) => a.id === addon.id)}
                                        onToggle={() => toggleAddon(addon)}
                                        dynamicStyles={dynamicStyles}
                                        freeText={themeColors.addonPriceFreeText}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Inline Upgrade Section (McDonald's kiosk style) */}
                    {/* Related Items Section */}
                    {relatedItems.length > 0 && (
                        <div className="relative">
                            <AdminEditPencil
                                visible={isBrandAdmin}
                                onClick={() => openBrandingEditor('related_items')}
                                label="Edit related items branding"
                                className="absolute right-0 top-10 z-10"
                            />
                            <LazyRelatedItemsSection
                                relatedItems={relatedItems}
                                tenantSlug={tenant.slug}
                            />
                        </div>
                    )}
                </div>
            </main>

            {/* Image Modal / Lightbox */}
            <LazyImageModal
                isOpen={isImageModalOpen}
                onOpenChange={handleCloseImageModal}
                imageUrl={item.image_url}
                itemName={item.name}
            />

            {/* Full-screen "Make it a Meal?" upgrade screen */}
            {menuEngineeringEnabled && (upgradeUpsells.length > 0 || upsellBundles.length > 0) && (
                <InlineUpgradeSection
                    open={isUpgradeScreenOpen}
                    sourceItem={item}
                    upgrades={upgradeUpsells}
                    bundles={upsellBundles}
                    onSelectUpgrade={(upgrade) => {
                        setIsUpgradeScreenOpen(false)
                        setUpgradeDismissed(true)
                        // Trigger slide-left exit animation, then navigate
                        pendingNavigationRef.current = `/${tenant.slug}/menu/item/${upgrade.targetItem.id}?upgraded=1`
                        setIsPageTransitioning(true)
                    }}
                    onSelectBundle={(bundle) => {
                        setIsUpgradeScreenOpen(false)
                        setUpgradeDismissed(true)
                        setBundleForCustomization(bundle)
                    }}
                    onDismiss={() => {
                        setIsUpgradeScreenOpen(false)
                        setUpgradeDismissed(true)
                    }}
                    hideCurrencySymbol={hideCurrencySymbol}
                    tenantId={tenant.id}
                />
            )}

            {/* Unified post-add upsell screen (replaces PairSuggestionSheet, UpsellSuggestionModal, BundleUpsellModal) */}
            <PostAddUpsellScreen
                open={isPostAddUpsellOpen}
                onClose={handlePostAddUpsellClose}
                onAddItem={(upsellItem) => {
                    addItem(
                        upsellItem,
                        undefined,
                        [],
                        1,
                        undefined,
                        'suggestion',
                        item.id
                    )
                }}
                onAcceptBundle={(bundle) => {
                    setIsPostAddUpsellOpen(false)
                    setBundleForCustomization(bundle)
                }}
                suggestions={complementaryUpsells ?? []}
                matchingBundle={matchingBundle}
                triggerItemName={item.name}
                tenantId={tenant.id}
                sourceItemId={item.id}
                hideCurrencySymbol={hideCurrencySymbol}
            />

            {/* Bundle Wizard (replaces old BundleCustomizationModal) */}
            <BundleWizard
                open={!!bundleForCustomization}
                onClose={() => {
                    setBundleForCustomization(null)
                    if (buyNowIntentRef.current) {
                        buyNowIntentRef.current = false
                        router.push(`/${tenant.slug}/cart`)
                    }
                }}
                bundle={bundleForCustomization}
                branding={branding}
                hideCurrencySymbol={hideCurrencySymbol}
            />

            {isBrandAdmin && (
                <>
                    {/* Popup Preview Modal (admin only - renders above sidebar z-[56]) */}
                    <UpsellSuggestionModal
                        open={isPopupPreviewOpen}
                        onClose={() => setIsPopupPreviewOpen(false)}
                        onAddItem={() => { }}
                        suggestions={[{
                            id: 'preview-1',
                            tenant_id: tenant.id,
                            name: 'Sample Item',
                            description: 'A sample menu item for preview',
                            price: 199,
                            image_url: item.image_url || '',
                            category_id: item.category_id || '',
                            is_available: true,
                            order: 0,
                            variations: [],
                            addons: [],
                            variation_types: [],
                            created_at: '',
                            updated_at: '',
                        } as MenuItem]}
                        triggerItemName={item.name}
                        zIndexClass="z-[58]"
                    />

                    {/* Checkout Preview Modal (admin only - renders above sidebar z-[56]) */}
                    <CheckoutUpsellModal
                        open={isCheckoutPreviewOpen}
                        onContinue={() => setIsCheckoutPreviewOpen(false)}
                        tenantId={tenant.id}
                        branding={branding}
                        title="Before you go..."
                        subtitle="You might also enjoy these items"
                        maxItems={4}
                        previewSuggestions={[{
                            id: 'checkout-preview-1',
                            tenant_id: tenant.id,
                            name: 'Sample Item',
                            description: 'A sample menu item for preview',
                            price: 199,
                            image_url: item.image_url || '',
                            category_id: item.category_id || '',
                            is_available: true,
                            order: 0,
                            variations: [],
                            addons: [],
                            variation_types: [],
                            created_at: '',
                            updated_at: '',
                        } as MenuItem]}
                        previewColors={{
                            background: customizationDraft?.checkout_modal_background_color || '#ffffff',
                            title: customizationDraft?.checkout_modal_title_color || '#111111',
                            description: customizationDraft?.checkout_modal_description_color || '#6b7280',
                            price: customizationDraft?.checkout_modal_price_color || '#111111',
                            button: customizationDraft?.checkout_modal_button_color || '#3b82f6',
                            buttonText: customizationDraft?.checkout_modal_button_text_color || '#ffffff',
                            border: customizationDraft?.checkout_modal_border_color || '#e5e7eb',
                        }}
                        zIndexClass="z-[58]"
                    />
                </>
            )}

            {/* Sticky Footer */}
            <footer
                className="fixed bottom-0 left-0 right-0 z-40 border-t"
                style={dynamicStyles?.footer}
            >
                {/* Selected Summary */}
                <div className="relative px-5 pt-3 pb-2">
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => openBrandingEditor('footer_summary')}
                        label="Edit footer summary branding"
                        className="absolute right-5 top-2"
                    />
                    <p
                        className="text-xs truncate"
                        style={{ color: 'var(--pd-summary-text)' }}
                    >
                        {getSelectedSummary}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                        <div>
                            {hasDiscount && (
                                <span
                                    className="text-xs line-through mr-2"
                                    style={{ color: 'var(--pd-original-price)' }}
                                >
                                    {formatPrice(item.price * quantity, { hideCurrencySymbol })}
                                </span>
                            )}
                            <span
                                className="text-xl font-bold"
                                style={{ color: 'var(--pd-total-price)' }}
                            >
                                {formatPrice(totalPrice, { hideCurrencySymbol })}
                            </span>
                        </div>

                        {/* Quantity Controls */}
                        <div
                            className="flex items-center gap-1.5 rounded-full px-1.5"
                            style={{ backgroundColor: 'var(--pd-qty-bg)' }}
                        >
                            <button
                                type="button"
                                onClick={handleDecreaseQuantity}
                                disabled={quantity <= 1}
                                className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                                style={{ backgroundColor: 'var(--pd-qty-bg)' }}
                                aria-label="Decrease quantity"
                            >
                                <Minus className="h-4 w-4" style={{ color: 'var(--pd-qty-btn)' }} />
                            </button>
                            <span
                                className="w-8 text-center text-base font-semibold select-none"
                                style={{ color: 'var(--pd-qty-text)' }}
                            >
                                {quantity}
                            </span>
                            <button
                                type="button"
                                onClick={handleIncreaseQuantity}
                                className="h-9 w-9 rounded-full flex items-center justify-center active:scale-95 transition-all"
                                style={{ backgroundColor: 'var(--pd-qty-bg)' }}
                                aria-label="Increase quantity"
                            >
                                <Plus className="h-4 w-4" style={{ color: 'var(--pd-qty-btn)' }} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="relative px-5 pb-5 pt-2 flex gap-3">
                    <AdminEditPencil
                        visible={isBrandAdmin}
                        onClick={() => openBrandingEditor('footer_buttons')}
                        label="Edit footer button branding"
                        className="absolute right-5 -top-3 z-10"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBuyNow}
                        className="flex-1 h-12 font-semibold text-base border-2 transition-all active:scale-[0.98]"
                        style={dynamicStyles?.buttonBuyNow}
                    >
                        {themeColors.buyNowButtonLabel}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => handleAddToCart(false)}
                        className="flex-1 h-12 font-semibold text-base transition-all active:scale-[0.98]"
                        style={dynamicStyles?.buttonAddToCart}
                    >
                        {themeColors.addToCartButtonLabel}
                    </Button>
                </div>
            </footer>

            {isBrandAdmin && (
                <LazyProductDetailCustomizer
                    tenant={tenant}
                    onPreview={setCustomizationDraft}
                    onSaved={() => {
                        router.refresh()
                    }}
                    onTogglePopupPreview={handleTogglePopupPreview}
                    onToggleCheckoutPreview={handleToggleCheckoutPreview}
                />
            )}
        </motion.div>
    )
})
