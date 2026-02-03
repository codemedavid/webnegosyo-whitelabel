'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { ChevronLeft, Minus, Plus, Share2, UtensilsCrossed, Flame, Leaf, WheatOff, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { formatPrice, calculateCartItemSubtotal } from '@/lib/cart-utils'
import { toast } from 'sonner'
import type { MenuItem, Variation, Addon, VariationOption, Category } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'
import type { BrandingColors } from '@/lib/branding-utils'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import { mergeSettingsWithBranding, getProductDetailThemeCSS, computeProductDetailStyles } from '@/lib/product-detail-theme'
import { LazyImageModal, LazyProductDetailCustomizer, LazyRelatedItemsSection } from './product-detail-lazy'
import { motion, AnimatePresence } from 'framer-motion'

interface ProductDetailContentProps {
    tenant: SelectedTenant
    item: MenuItem
    branding: BrandingColors
    category?: Category | null
    relatedItems?: MenuItem[]
    customization?: ProductDetailSettings | null
}

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
}

const VariationOptionButton = memo(function VariationOptionButton({
    option,
    isSelected,
    onSelect,
    dynamicStyles
}: VariationOptionButtonProps) {
    return (
        <motion.button
            key={option.id}
            type="button"
            onClick={onSelect}
            className="px-4 py-2.5 text-sm font-medium transition-all border"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
            layout
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
        >
            <span className="font-semibold">{option.name}</span>
            {option.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
                    (+{formatPrice(option.price_modifier)})
                </span>
            )}
        </motion.button>
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
        <motion.button
            key={variation.id}
            type="button"
            onClick={onSelect}
            className="px-4 py-2.5 text-sm font-medium transition-all border"
            style={isSelected ? dynamicStyles?.variationButtonSelected : dynamicStyles?.variationButton}
            layout
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
        >
            <span className="font-semibold">{variation.name}</span>
            {variation.price_modifier !== 0 && (
                <span className="ml-1 opacity-90" style={{ color: 'var(--pd-variation-price)' }}>
                    (+{formatPrice(variation.price_modifier)})
                </span>
            )}
        </motion.button>
    )
})

// Memoized Addon Button Component
interface AddonButtonProps {
    addon: Addon
    isSelected: boolean
    onToggle: () => void
    dynamicStyles: Record<string, React.CSSProperties> | undefined
}

const AddonButton = memo(function AddonButton({
    addon,
    isSelected,
    onToggle,
    dynamicStyles
}: AddonButtonProps) {
    return (
        <motion.button
            key={addon.id}
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between p-3.5 border-2 transition-all"
            style={isSelected ? dynamicStyles?.addonButtonSelected : dynamicStyles?.addonButton}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            whileTap={{ scale: 0.98 }}
            layout
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
                {addon.price === 0 ? 'Free' : `+${formatPrice(addon.price)}`}
            </span>
        </motion.button>
    )
})



export const ProductDetailContent = memo(function ProductDetailContent({
    tenant,
    item,
    branding,
    category,
    relatedItems = [],
    customization = null,
}: ProductDetailContentProps) {
    const router = useRouter()
    const { addItem, setTenantContext } = useCart()

    const [isImageModalOpen, setIsImageModalOpen] = useState(false)
    const [customizationDraft, setCustomizationDraft] = useState<Partial<ProductDetailSettings> | null>(null)

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
    const hasAddons = useMemo(() => item.addons.length > 0, [item.addons.length])
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

        return parts.length > 0 ? parts.join(', ') : 'Standard'
    }, [useNewVariations, item.variation_types, selectedVariations, selectedVariation, selectedAddons])

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

        // Pass the appropriate variation format
        const variationData = useNewVariations ? selectedVariations : selectedVariation
        addItem(item, variationData, selectedAddons, quantity)
        toast.success(`Added ${item.name} to cart`)
        if (!skipNavigation) {
            router.back()
        }
    }, [useNewVariations, item, selectedVariations, selectedVariation, selectedAddons, quantity, addItem, router])

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
                <div className="flex items-center justify-between">
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
                </div>
            </header>

            {/* Main Content - Scrollable */}
            <main className="flex-1 overflow-y-auto pb-40" style={{ backgroundColor: 'var(--pd-page-background)' }}>
                {/* Product Image - Hero */}
                <div className="relative w-full h-[50vh]" style={{ backgroundColor: 'var(--pd-image-background)' }}>
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
                <div className="px-5 py-6" style={{ padding: 'var(--pd-section-padding)' }}>
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
                                    <div className="flex items-center gap-2 mb-3">
                                        <h3
                                            className="text-base font-semibold"
                                            style={{
                                                color: 'var(--pd-variation-title)',
                                                fontSize: 'var(--pd-variation-title-font-size)'
                                            }}
                                        >
                                            {variationType.name}
                                        </h3>
                                        {variationType.is_required && (
                                            <span
                                                className="text-xs font-medium px-2 py-0.5 rounded"
                                                style={{ color: 'var(--pd-variation-required)' }}
                                            >
                                                * Pick 1
                                            </span>
                                        )}
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
                                <div className="flex items-center gap-2 mb-3">
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
                                        * Pick 1
                                    </span>
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
                                <h3
                                    className="text-base font-semibold mb-3"
                                    style={{
                                        color: 'var(--pd-addon-title)',
                                        fontSize: 'var(--pd-addon-title-font-size)'
                                    }}
                                >
                                    Add-ons <span style={{ color: 'var(--pd-text-muted)' }} className="font-normal text-xs">(Optional)</span>
                                </h3>

                                <div className="space-y-2">
                                    <AnimatePresence>
                                        {item.addons.map((addon) => (
                                            <AddonButton
                                                key={addon.id}
                                                addon={addon}
                                                isSelected={selectedAddons.some((a) => a.id === addon.id)}
                                                onToggle={() => toggleAddon(addon)}
                                                dynamicStyles={dynamicStyles}
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

            {/* Sticky Footer */}
            <footer
                className="fixed bottom-0 left-0 right-0 z-40 border-t"
                style={dynamicStyles?.footer}
            >
                {/* Selected Summary */}
                <div className="px-5 pt-3 pb-2">
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
                                    {formatPrice(item.price * quantity)}
                                </span>
                            )}
                            <span
                                className="text-xl font-bold"
                                style={{ color: 'var(--pd-total-price)' }}
                            >
                                {formatPrice(totalPrice)}
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
                <div className="px-5 pb-5 pt-2 flex gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleBuyNow}
                        className="flex-1 h-12 font-semibold text-base border-2 transition-all active:scale-[0.98]"
                        style={dynamicStyles?.buttonBuyNow}
                    >
                        Buy Now
                    </Button>
                    <Button
                        type="button"
                        onClick={() => handleAddToCart(false)}
                        className="flex-1 h-12 font-semibold text-base transition-all active:scale-[0.98]"
                        style={dynamicStyles?.buttonAddToCart}
                    >
                        Add To Cart
                    </Button>
                </div>
            </footer>

            <LazyProductDetailCustomizer
                tenant={tenant}
                onPreview={setCustomizationDraft}
                onSaved={() => {
                    // No reload needed - server action revalidates cached pages automatically
                }}
            />
        </div>
    )
})
