'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { ChevronLeft, Minus, Plus, Share2, UtensilsCrossed, Flame, Leaf, WheatOff, Heart, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
import { toast } from 'sonner'
import type { MenuItem, Variation, Addon, VariationOption, Category, UpgradeUpsell } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'
import type { BrandingColors } from '@/lib/branding-utils'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import { mergeSettingsWithBranding, getProductDetailThemeCSS, computeProductDetailStyles } from '@/lib/product-detail-theme'
import { LazyImageModal, LazyProductDetailCustomizer, LazyRelatedItemsSection } from './product-detail-lazy'
import { UpsellSuggestionModal } from './upsell-suggestion-modal'
import { UpgradeUpsellModal } from './upgrade-upsell-modal'
import { CheckoutUpsellModal } from './checkout-upsell-modal'
import { motion, AnimatePresence } from 'framer-motion'

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
}

interface ProductDetailCustomizerOpenDetail {
    tab?: 'colors' | 'typography' | 'layout'
    section?: 'header' | 'image' | 'product_info' | 'variations' | 'addons' | 'footer_summary' | 'footer_buttons'
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
}: ProductDetailContentProps) {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const { addItem, setTenantContext } = useCart()

    const [isImageModalOpen, setIsImageModalOpen] = useState(false)
    const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false)
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
    const [isPopupPreviewOpen, setIsPopupPreviewOpen] = useState(false)
    const [isCheckoutPreviewOpen, setIsCheckoutPreviewOpen] = useState(false)
    const [customizationDraft, setCustomizationDraft] = useState<Partial<ProductDetailSettings> | null>(null)
    const [isBrandAdmin, setIsBrandAdmin] = useState(false)

    // Legacy single variation
    const [selectedVariation, setSelectedVariation] = useState<Variation | undefined>()
    // New grouped variations: map of type ID -> selected option
    const [selectedVariations, setSelectedVariations] = useState<{ [typeId: string]: VariationOption }>({})
    const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
    const [quantity, setQuantity] = useState(1)

    // Determine if using new or legacy variation system - memoized
    const useNewVariations = useMemo(() =>
        item.variation_types && item.variation_types.length > 0,
        [item.variation_types]
    )

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

    // Show inline branding controls only for authenticated tenant admins/superadmins.
    useEffect(() => {
        let isCancelled = false

        async function checkAdminRole() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: role } = await supabase
                .from('app_users')
                .select('role, tenant_id')
                .eq('user_id', user.id)
                .maybeSingle()

            if (isCancelled) return

            const userRole = role as { role: string; tenant_id: string | null } | null
            const allowed = !!userRole && (
                userRole.role === 'superadmin' ||
                (userRole.role === 'admin' && userRole.tenant_id === tenant.id)
            )
            setIsBrandAdmin(allowed)
        }

        checkAdminRole()
        return () => { isCancelled = true }
    }, [supabase, tenant.id])

    // Initialize/reset default selections when item changes
    useEffect(() => {
        // Reset legacy variations
        if (item.variations && item.variations.length > 0) {
            const defaultVar = item.variations.find((v) => v.is_default) || item.variations[0]
            setSelectedVariation(defaultVar)
        } else {
            setSelectedVariation(undefined)
        }

        // Reset new variation types
        if (item.variation_types && item.variation_types.length > 0) {
            const defaults: { [typeId: string]: VariationOption } = {}
            item.variation_types.forEach(type => {
                if (type.options.length > 0) {
                    const defaultOption = type.options.find(opt => opt.is_default) || type.options[0]
                    defaults[type.id] = defaultOption
                }
            })
            setSelectedVariations(defaults)
        } else {
            setSelectedVariations({})
        }

        // Reset addons and quantity when product changes
        setSelectedAddons([])
        setQuantity(1)
    }, [item.id, item.variations, item.variation_types])

    // Memoized boolean flags and computed values
    const hasDiscount = useMemo(() =>
        item.discounted_price && item.discounted_price < item.price,
        [item.discounted_price, item.price]
    )

    const basePrice = useMemo(() =>
        hasDiscount ? item.discounted_price! : item.price,
        [hasDiscount, item.discounted_price, item.price]
    )

    const hasVariations = useMemo(() => item.variations.length > 0, [item.variations.length])
    const hasVariationTypes = useMemo(() =>
        item.variation_types && item.variation_types.length > 0,
        [item.variation_types]
    )
    // Merge item add-ons with category default add-ons (item-level wins on name conflict)
    const mergedAddons = useMemo(() => {
        const categoryAddons = category?.default_addons || []
        if (categoryAddons.length === 0) return item.addons

        const itemAddonNames = new Set(item.addons.map(a => a.name.toLowerCase()))
        const uniqueCategoryAddons = categoryAddons.filter(
            a => !itemAddonNames.has(a.name.toLowerCase())
        )
        return [...item.addons, ...uniqueCategoryAddons]
    }, [item.addons, category?.default_addons])

    const hasAddons = useMemo(() => mergedAddons.length > 0, [mergedAddons.length])
    const hasCustomizations = useMemo(() =>
        hasVariations || hasVariationTypes || hasAddons,
        [hasVariations, hasVariationTypes, hasAddons]
    )
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

    // Calculate total price based on which variation system is used
    const totalPrice = useMemo(() =>
        useNewVariations
            ? calculateCartItemSubtotal(basePrice, selectedVariations, selectedAddons, quantity)
            : calculateCartItemSubtotal(basePrice, selectedVariation, selectedAddons, quantity),
        [useNewVariations, basePrice, selectedVariations, selectedVariation, selectedAddons, quantity]
    )

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

    const handleOpenImageModal = useCallback(() => {
        setIsImageModalOpen(true)
    }, [])

    const handleCloseImageModal = useCallback((open: boolean) => {
        setIsImageModalOpen(open)
    }, [])



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

        if (!skipNavigation) {
            if (menuEngineeringEnabled && upgradeUpsells.length > 0) {
                // Show upgrade modal FIRST — don't add to cart yet
                setIsUpgradeModalOpen(true)
                return
            }
            if (menuEngineeringEnabled && complementaryUpsells.length > 0) {
                // Add to cart, then show complementary suggestions
                addCurrentItemToCart()
                setIsUpsellModalOpen(true)
                return
            }
        }

        // Default: add to cart and navigate back
        addCurrentItemToCart()
        if (!skipNavigation) {
            router.back()
        }
    }, [useNewVariations, item, selectedVariations, addCurrentItemToCart, router, menuEngineeringEnabled, upgradeUpsells, complementaryUpsells])

    const handleBuyNow = useCallback(() => {
        handleAddToCart(true) // Skip navigation back, we'll go to checkout instead
        router.push(`/${tenant.slug}/checkout`)
    }, [handleAddToCart, router, tenant.slug])

    const handleDecreaseQuantity = useCallback(() => {
        setQuantity(prev => Math.max(1, prev - 1))
    }, [])

    const handleIncreaseQuantity = useCallback(() => {
        setQuantity(prev => prev + 1)
    }, [])

    const toggleAddon = useCallback((addon: Addon) => {
        setSelectedAddons((prev) => {
            const exists = prev.find((a) => a.id === addon.id)
            if (exists) {
                return prev.filter((a) => a.id !== addon.id)
            }
            return [...prev, addon]
        })
    }, [])

    const handleShare = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success('Link copied!')
        } catch {
            toast.error('Failed to copy link')
        }
    }, [])

    const handleTogglePopupPreview = useCallback(() => {
        setIsPopupPreviewOpen(prev => !prev)
    }, [])

    const handleToggleCheckoutPreview = useCallback(() => {
        setIsCheckoutPreviewOpen(prev => !prev)
    }, [])

    const handleUpgradeClose = useCallback(() => {
        setIsUpgradeModalOpen(false)
        // User declined upgrade — add the original item to cart now
        addCurrentItemToCart()
        // Then check for complementary suggestions
        if (menuEngineeringEnabled && complementaryUpsells.length > 0) {
            setIsUpsellModalOpen(true)
        } else {
            router.back()
        }
    }, [addCurrentItemToCart, router, menuEngineeringEnabled, complementaryUpsells])

    const handleUpgrade = useCallback((upgradeItem: MenuItem) => {
        // Original was never added — just add the upgrade item
        addItem(upgradeItem, undefined, [], quantity)
        toast.success(`Upgraded to ${upgradeItem.name}`)
        setIsUpgradeModalOpen(false)
        // After upgrade, check for complementary suggestions
        if (menuEngineeringEnabled && complementaryUpsells.length > 0) {
            setIsUpsellModalOpen(true)
        } else {
            router.back()
        }
    }, [addItem, quantity, router, menuEngineeringEnabled, complementaryUpsells])

    const handleUpsellClose = useCallback(() => {
        setIsUpsellModalOpen(false)
        router.back()
    }, [router])

    const handleUpsellAddItem = useCallback((upsellItem: MenuItem) => {
        addItem(upsellItem, undefined, [], 1)
        toast.success(`Added ${upsellItem.name} to cart`)
    }, [addItem])

    const handleVariationTypeSelect = useCallback((typeId: string, option: VariationOption) => {
        setSelectedVariations(prev => ({ ...prev, [typeId]: option }))
    }, [])

    const handleLegacyVariationSelect = useCallback((variation: Variation) => {
        setSelectedVariation(variation)
    }, [])

    return (
        <div
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
            <main className="flex-1 overflow-y-auto pb-40" style={{ backgroundColor: 'var(--pd-page-background)' }}>
                {/* Product Image - Hero */}
                <div className="relative w-full h-[50vh]" style={{ backgroundColor: 'var(--pd-image-background)' }}>
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
                                sizes="100vw"
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
                    <AnimatePresence>
                        {hasVariationTypes && item.variation_types && item.variation_types.map((variationType) => {
                            const selectedOption = selectedVariations[variationType.id]

                            return (
                                <motion.div
                                    key={variationType.id}
                                    className="mb-6"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
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
                                        <AnimatePresence mode="popLayout">
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
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>

                    {/* Legacy Variations */}
                    <AnimatePresence>
                        {!useNewVariations && hasVariations && (
                            <motion.div
                                className="mb-6"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
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
                                    <AnimatePresence mode="popLayout">
                                        {item.variations.map((variation) => (
                                            <LegacyVariationButton
                                                key={variation.id}
                                                variation={variation}
                                                isSelected={selectedVariation?.id === variation.id}
                                                onSelect={() => handleLegacyVariationSelect(variation)}
                                                dynamicStyles={dynamicStyles}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Add-ons */}
                    <AnimatePresence>
                        {hasAddons && (
                            <motion.div
                                className="mb-6"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                            >
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
                                    <AnimatePresence>
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
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Related Items Section */}
                    {relatedItems.length > 0 && (
                        <LazyRelatedItemsSection
                            relatedItems={relatedItems}
                            tenantSlug={tenant.slug}
                        />
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

            {/* Upgrade Upsell Modal (kiosk-style comparison) */}
            {menuEngineeringEnabled && upgradeUpsells.length > 0 && (
                <UpgradeUpsellModal
                    open={isUpgradeModalOpen}
                    onClose={handleUpgradeClose}
                    onUpgrade={handleUpgrade}
                    sourceItem={item}
                    upgrade={upgradeUpsells[0]}
                />
            )}

            {/* Upsell Suggestion Modal */}
            {menuEngineeringEnabled && complementaryUpsells.length > 0 && (
                <UpsellSuggestionModal
                    open={isUpsellModalOpen}
                    onClose={handleUpsellClose}
                    onAddItem={handleUpsellAddItem}
                    suggestions={complementaryUpsells}
                    triggerItemName={item.name}
                />
            )}

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

            <LazyProductDetailCustomizer
                tenant={tenant}
                onPreview={setCustomizationDraft}
                onSaved={() => {
                    // No reload needed - server action revalidates cached pages automatically
                }}
                onTogglePopupPreview={handleTogglePopupPreview}
                onToggleCheckoutPreview={handleToggleCheckoutPreview}
            />
        </div>
    )
})
