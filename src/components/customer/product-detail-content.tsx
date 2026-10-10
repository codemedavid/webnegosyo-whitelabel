'use client'

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { useRouter } from 'next/navigation'
import { OptimizedImage } from '@/components/shared/optimized-image'
import { ChevronLeft, Minus, Plus, Share2, UtensilsCrossed, Flame, Leaf, WheatOff, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/hooks/useCart'
import { useVariationState } from '@/hooks/useVariationState'
import { useModifierGroups } from '@/hooks/useModifierGroups'
import type { LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { AdminEditPencil } from '@/components/customer/product-detail/admin-edit-pencil'
import { ProductVariations, ProductAddons } from '@/components/customer/product-detail/product-options'
import { addonLabel } from '@/lib/addon-quantity'
import { ModifierGroupsSelector } from '@/components/customer/modifier-groups-selector'
import { useProductDetailModals } from '@/hooks/useProductDetailModals'
import { formatPrice } from '@/lib/cart-utils'
import { toast } from 'sonner'
import type { MenuItem, Category, UpgradeUpsell } from '@/types/database'
import type { SelectedTenant } from '@/lib/product-detail-data'
import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'
import { useBrandingPreviewDraft, useBrandingPreviewTenant, useIsMobileViewport } from '@/hooks/use-branding-preview'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { StoreClosedBanner } from '@/components/customer/store-closed-banner'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'
import { isMenuItemOrderable } from '@/lib/menu-item-availability'
import { useBranchPricing } from '@/hooks/use-branch-pricing'
import { useStockCeilings, selectCeiling } from '@/hooks/use-stock-ceilings'
import { resolveAddableQuantity, describeRemainingStock } from '@/lib/inventory/stepper-cap'
import { MAX_CART_ITEM_QUANTITY } from '@/lib/cart-utils'
import { usePresellAvailability } from '@/hooks/use-presell-availability'
import { PresellDatePicker } from '@/components/customer/presell-date-picker'
import { countPresellInCart, describePresellRemaining, findCartPresellDate, resolvePresellAddable } from '@/lib/presell/availability'
import { formatPresellDateLabel } from '@/lib/presell/month-grid'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { applyMobileOverrides, type OverrideMap } from '@/lib/mobile-overrides'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import type { BundleWithSlots } from '@/types/database'
import { mergeSettingsWithBranding, getProductDetailThemeCSS, computeProductDetailStyles } from '@/lib/product-detail-theme'
import { transformImageUrl as transformCloudinaryUrl, isOptimizableImageUrl as isCloudinaryUrl } from '@/lib/imagekit-utils'
import { UpsellOrchestratorProvider } from '@/lib/upsell-orchestrator'
import dynamic from 'next/dynamic'
import { LazyImageModal, LazyProductDetailCustomizer, LazyRelatedItemsSection } from './product-detail-lazy'
import { BackgroundOverlayLayer } from './background-overlay-layer'
import { buildBackgroundRootStyle, resolveBackgroundOverlay } from '@/lib/background-overlay'
import { motion } from 'framer-motion'
import { useSeniorMode } from '@/components/customer/senior-mode/senior-mode-provider'
import { describeAddedToCart } from '@/lib/senior-mode'
import { ItemOffers, combosContainingItem } from '@/components/customer/offers/item-offers'
import { postAddOffers } from '@/lib/boost/offer-items'
import { cartOfferThemeFromBranding, offerThemeFromBranding } from '@/components/customer/offers/offer-theme'
import { CartOfferRow } from '@/components/customer/offers/cart-offer-row'

// Upsell/checkout modals — not visible on initial render; lazy-load them.
const AddedSheet = dynamic(
  () => import('@/components/customer/offers/added-sheet').then((m) => ({ default: m.AddedSheet })),
  { ssr: false }
)
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)

/**
 * Senior mode's add-to-cart confirmation: long enough to read a two-line
 * message, short enough not to linger — the bottom cart bar keeps showing the
 * count afterwards.
 */
const SENIOR_ADDED_TOAST_MS = 3000

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
    pairingRulesEnabled?: boolean
    hideCurrencySymbol?: boolean
    upsellBundles?: BundleWithSlots[]
    bundlesEnabled?: boolean
    modifierGroupsEnabled?: boolean
    /** Menu items referenced by linked add-on options, keyed by id. */
    linkedModifierItems?: ReadonlyMap<string, LinkedItemSnapshot>
    isBrandAdmin?: boolean
    /**
     * 'page' (default) renders as the full-page route. 'sheet' adapts navigation
     * for the bottom-sheet host: back/menu/post-add dismiss the sheet via onClose,
     * upgrades and related items swap in-place via onNavigateToItem, and Share
     * copies the canonical full-page URL.
     */
    mode?: 'page' | 'sheet'
    onClose?: () => void
    /** Sheet mode: the back arrow — the previous dish, else close. Defaults to onClose. */
    onBack?: () => void
    onNavigateToItem?: (item: MenuItem, opts?: { fromUpgrade?: boolean }) => void
    /**
     * Sheet mode: true while the per-item upsell data is still being fetched.
     * Used to defer the post-add upsell decision so a fast Add-to-Cart tap
     * doesn't skip the upsell screen (which the full page never does, since it
     * fetches server-side before paint).
     */
    upsellsPending?: boolean
}

interface ProductDetailCustomizerOpenDetail {
    tab?: 'colors' | 'typography' | 'layout'
    section?: 'header' | 'image' | 'product_info' | 'variations' | 'addons' | 'related_items' | 'footer_summary' | 'footer_buttons'
    pane?: 'palette' | 'settings'
}

// Memoized Dietary Tag Component
interface DietaryTagProps {
    label: string
    icon: React.ComponentType<{ className?: string }>
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

export const ProductDetailContent = memo(function ProductDetailContent({
    tenant: tenantProp,
    item: storeWideItem,
    branding: brandingProp,
    category,
    relatedItems: storeWideRelatedItems = [],
    customization = null,
    complementaryUpsells: storeWideComplementaryUpsells = [],
    upgradeUpsells = [],
    menuEngineeringEnabled = false,
    pairingRulesEnabled = false,
    hideCurrencySymbol,
    upsellBundles = [],
    bundlesEnabled = false,
    modifierGroupsEnabled = false,
    linkedModifierItems,
    isBrandAdmin = false,
    mode = 'page',
    onClose,
    onBack,
    onNavigateToItem,
    upsellsPending = false,
}: ProductDetailContentProps) {
    const router = useRouter()
    const isSheet = mode === 'sheet'
    // Branding Studio live preview — the item page computes branding on the
    // server, so when a preview draft is streaming we merge it over the tenant
    // and recompute branding client-side for real-time accuracy.
    const tenant = useBrandingPreviewTenant(tenantProp)
    // This page is server-rendered and cached for every branch at once, so the
    // branch is applied here — to the dish, and to everything else on the page
    // that carries a price. A tenant without branches gets identity back.
    const branchPricing = useBranchPricing({ tenant: tenantProp, tenantSlug: tenantProp.slug })
    const item = useMemo(() => branchPricing.resolve(storeWideItem), [branchPricing, storeWideItem])
    const relatedItems = useMemo(
        () => branchPricing.resolveAll(storeWideRelatedItems),
        [branchPricing, storeWideRelatedItems]
    )
    const complementaryUpsells = useMemo(
        () => branchPricing.resolveAll(storeWideComplementaryUpsells),
        [branchPricing, storeWideComplementaryUpsells]
    )
    // Operating-hours enforcement: resolves after mount (this page is cached), so
    // the closed notice and the disabled actions appear a frame after hydration.
    const openStatus = useStoreOpenStatus(tenant)
    const isOrderable = isMenuItemOrderable(item)
    const previewDraft = useBrandingPreviewDraft()
    const branding = useMemo(
        () => (previewDraft ? getTenantBranding(tenant as unknown as Record<string, unknown>) : brandingProp),
        [previewDraft, tenant, brandingProp]
    )
    const { addItem, setTenantContext, items: cartItems } = useCart()
    const isSeniorMode = useSeniorMode()
    const mainContentRef = useRef<HTMLElement | null>(null)
    const [isPageTransitioning, setIsPageTransitioning] = useState(false)
    const pendingNavigationRef = useRef<string | null>(null)
    // Sheet mode: set (to the cart from before the add) when Add-to-Cart fires
    // before upsell data has loaded, so the post-add decision is deferred
    // until upsellsPending clears.
    const pendingPostAddRef = useRef<readonly string[] | null>(null)
    // The pairings the "Added" sheet shows, frozen at the moment of the add:
    // what the diner already ordered is left out, and nothing jumps once a
    // suggestion inside the sheet joins the cart.
    const [addedSheetOffers, setAddedSheetOffers] = useState<MenuItem[]>([])
    const [customizationDraft, setCustomizationDraft] = useState<Partial<ProductDetailSettings> | null>(null)

    const {
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
        handleOpenImageModal,
        handleCloseImageModal,
        handleTogglePopupPreview,
        handleToggleCheckoutPreview,
        handlePostAddUpsellClose,
    } = useProductDetailModals({
        tenantSlug: tenant.slug,
        onExit: isSheet ? onClose : undefined,
    })

    // The item page's offers use the merchant's own colours, never a fixed palette.
    const offerTheme = useMemo(() => offerThemeFromBranding(branding), [branding])
    // Upgrade targets carry store-wide prices; resolve them to this branch so
    // the "+₱X" difference is against the price the diner actually pays.
    const branchUpgrades = useMemo(
        () => upgradeUpsells.map((upgrade) => ({ ...upgrade, targetItem: branchPricing.resolve(upgrade.targetItem) })),
        [upgradeUpsells, branchPricing]
    )

    const {
        selectedVariation,
        selectedVariations,
        selectedAddons,
        quantity,
        useNewVariations,
        hasCustomizations,
        hasDiscount,
        totalPrice,
        mergedAddons,
        handleVariationTypeSelect,
        handleLegacyVariationSelect,
        changeAddonQuantity,
        handleDecreaseQuantity,
        handleIncreaseQuantity,
    } = useVariationState({ item, category })

    // Unified modifier groups (Phase 2). Active only for items authored with the
    // new editor AND when the tenant flag is on; legacy items keep the path above.
    const mg = useModifierGroups({ item, linkedItems: linkedModifierItems })
    const useGroups = modifierGroupsEnabled && mg.active
    const effectiveQuantity = useGroups ? mg.quantity : quantity
    const effectiveTotalPrice = useGroups ? mg.totalPrice : totalPrice
    const rawIncreaseQuantity = useGroups ? mg.incrementQuantity : handleIncreaseQuantity
    const effectiveDecreaseQuantity = useGroups ? mg.decrementQuantity : handleDecreaseQuantity
    const showCustomizations = useGroups ? mg.groups.length > 0 : hasCustomizations

    // ── Stock ceiling (how many of this dish the kitchen can actually make) ──
    // Checkout refuses an uncoverable cart on every backend; this is the same
    // ceiling surfaced where the number is chosen, so nobody walks through the
    // whole checkout to be turned away on the last screen. Untracked dishes get
    // `null` and behave exactly as they always have.
    const ceilings = useStockCeilings(tenant.id, branchPricing.selectedOutletId)
    const stockCeiling = selectCeiling(ceilings, item.id)
    // What the cart already holds of this dish, across every configuration of
    // it: five in the cart as three Large and two Small is still five pizzas'
    // worth of flour.
    const alreadyInCart = useMemo(
        () => cartItems.reduce((sum, line) => (line.menu_item.id === item.id ? sum + line.quantity : sum), 0),
        [cartItems, item.id],
    )
    // ── Presell (per-date stock) ──
    // A presell dish is sold against a DATE, not a shelf: the customer picks a
    // pickup date from the calendar and the stepper stops where that date's
    // allocation does. No allocation on a date means zero, deliberately the
    // inverse of ingredient ceilings. A cart holds one presell date, so a date
    // already committed to is pre-selected here.
    const isPresell = Boolean(tenant.presell_enabled && item.presell_enabled)
    const { calendar: presellCalendar, isLoading: isPresellLoading } = usePresellAvailability(tenant.id, item.id, isPresell)
    const presellTodayKey = useMemo(() => toBusinessDayKey(new Date().toISOString()), [])
    const committedPresellDate = useMemo(() => findCartPresellDate(cartItems), [cartItems])
    const [presellDate, setPresellDate] = useState<string | null>(committedPresellDate)
    const presellRemaining = isPresell && presellDate ? (presellCalendar.get(presellDate) ?? null) : null
    const presellAlreadyInCart = isPresell && presellDate ? countPresellInCart(cartItems, item.id, presellDate) : 0

    const addableQuantity = isPresell
        ? (presellDate ? resolvePresellAddable(presellRemaining, presellAlreadyInCart, MAX_CART_ITEM_QUANTITY) : MAX_CART_ITEM_QUANTITY)
        : resolveAddableQuantity(stockCeiling, alreadyInCart, MAX_CART_ITEM_QUANTITY)
    const stockHint = isPresell
        ? (presellDate && presellRemaining !== null ? describePresellRemaining(presellRemaining, presellAlreadyInCart) : null)
        : describeRemainingStock(stockCeiling, alreadyInCart)
    const canIncreaseQuantity = effectiveQuantity < addableQuantity

    const effectiveIncreaseQuantity = useCallback(() => {
        if (!canIncreaseQuantity) return
        rawIncreaseQuantity()
    }, [canIncreaseQuantity, rawIncreaseQuantity])

    // Merge customization settings with branding. The Branding Studio streams
    // product-detail edits under __productDetailDraft (kept separate from the
    // tenant-column draft because column names collide across the two stores);
    // merge it over the saved settings so Studio edits preview live. The
    // in-page pencil editor (customizationDraft) still takes priority when open.
    const isMobileViewport = useIsMobileViewport()
    const studioProductDraft = previewDraft?.__productDetailDraft as Partial<ProductDetailSettings> | undefined
    const studioProductMobile = previewDraft?.__productMobileOverrides as OverrideMap | undefined
    const savedProductMobile = (customization as { mobile_overrides?: OverrideMap } | null)?.mobile_overrides
    const activeCustomization = useMemo(() => {
        if (customizationDraft) return customizationDraft
        // Saved settings, with the tenant's mobile overrides applied on a phone.
        let base: Partial<ProductDetailSettings> | null = customization
        if (isMobileViewport && base) {
            base = applyMobileOverrides(base as Record<string, unknown>, savedProductMobile) as Partial<ProductDetailSettings>
        }
        // Studio preview: desktop product draft, then its mobile layer.
        if (studioProductDraft && Object.keys(studioProductDraft).length > 0) {
            base = { ...(base ?? {}), ...studioProductDraft } as Partial<ProductDetailSettings>
        }
        if (isMobileViewport && studioProductMobile) {
            base = applyMobileOverrides((base ?? {}) as Record<string, unknown>, studioProductMobile) as Partial<ProductDetailSettings>
        }
        return base
    }, [customizationDraft, studioProductDraft, studioProductMobile, savedProductMobile, customization, isMobileViewport])

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
        const tags: Array<{ label: string; icon: React.ComponentType<{ className?: string }> }> = []
        const text = `${item.name} ${item.description}`.toLowerCase()
        const spicyKeywordPattern = /\b(spicy|chili|chilli|jalapeno|jalapeño|sriracha|buffalo|wasabi|harissa|sambal|gochujang)\b/
        const spicyPhrasePattern = /\bhot\s+(sauce|salsa|wings|wing|chicken|pepper|peppers)\b/

        if (text.includes('vegetarian') || text.includes('veg')) {
            tags.push({ label: 'Vegetarian', icon: Leaf })
        }
        if (text.includes('vegan')) {
            tags.push({ label: 'Vegan', icon: Leaf })
        }
        if (spicyKeywordPattern.test(text) || spicyPhrasePattern.test(text)) {
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
        if (isSheet) {
            const back = onBack ?? onClose
            back?.()
            return
        }
        router.back()
    }, [isSheet, onBack, onClose, router])

    const handleGoHome = useCallback(() => {
        router.push(`/${tenant.slug}`)
    }, [router, tenant.slug])

    const handleGoMenu = useCallback(() => {
        // In sheet mode we're already on the menu — just close the sheet.
        if (isSheet) {
            onClose?.()
            return
        }
        router.push(`/${tenant.slug}/menu`)
    }, [isSheet, onClose, router, tenant.slug])

    // Generate selected summary text - memoized
    const getSelectedSummary = useMemo(() => {
        const parts: string[] = []

        if (useGroups) {
            const names = mg.groups.flatMap((group) => {
                const selectedIds = mg.selection[group.id] ?? []
                return group.options.filter((o) => selectedIds.includes(o.id)).map((o) => addonLabel({ name: o.name, quantity: selectedIds.filter(id => id === o.id).length }))
            })
            return names.length > 0 ? names.join(', ') : themeColors.footerEmptySummaryText
        }

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
            parts.push(...selectedAddons.map(addonLabel))
        }

        return parts.length > 0 ? parts.join(', ') : themeColors.footerEmptySummaryText
    }, [useGroups, mg.groups, mg.selection, useNewVariations, item.variation_types, selectedVariations, selectedVariation, selectedAddons, themeColors.footerEmptySummaryText])

    // The "added" toast, so the "Added" sheet can take over from it when the
    // pairings arrive after the add (a fast tap while they were still loading).
    const addedToastRef = useRef<string | number | null>(null)

    // Helper to add the current item to cart with current selections
    // `announce: false` when the "Added" sheet confirms the add instead of a toast.
    const addCurrentItemToCart = useCallback(({ announce = true }: { announce?: boolean } = {}): boolean => {
        const presell = isPresell && presellDate ? presellDate : undefined
        const result = useGroups
            ? addItem({ ...item, modifier_groups: mg.groups }, mg.cartFormat.selectedVariations, mg.cartFormat.selectedAddons, mg.quantity, undefined, undefined, undefined, presell)
            : addItem(item, useNewVariations ? selectedVariations : selectedVariation, selectedAddons, quantity, undefined, undefined, undefined, presell)
        if (!result.ok) {
            toast.error(`Your cart is already for ${formatPresellDateLabel(result.committedDate)}. Pre-orders are placed one date at a time.`)
            return false
        }
        if (!announce) return true
        if (isSeniorMode) {
            // Senior mode: a larger worded confirmation (styled by .senior-toast
            // in SeniorModeProvider), shown at the TOP so it never covers the
            // bottom "View cart" bar that is the customer's next tap.
            const message = describeAddedToCart(item.name, useGroups ? mg.quantity : quantity, presell ? formatPresellDateLabel(presell) : undefined)
            addedToastRef.current = toast.success(message.title, { description: message.description, duration: SENIOR_ADDED_TOAST_MS, position: 'top-center', className: 'senior-toast' })
            return true
        }
        addedToastRef.current = toast.success(presell ? `Added ${item.name} for ${formatPresellDateLabel(presell)}` : `Added ${item.name} to cart`)
        return true
    }, [useGroups, mg.cartFormat, mg.groups, mg.quantity, useNewVariations, item, selectedVariations, selectedVariation, selectedAddons, quantity, addItem, isPresell, presellDate, isSeniorMode])

    // Only combos that contain this dish — never the store's first combo.
    const itemCombos = useMemo(
        () => (bundlesEnabled ? combosContainingItem(upsellBundles ?? [], item.id) : []),
        [bundlesEnabled, upsellBundles, item.id]
    )

    /** Pairings for "Added — goes well with…", given the cart BEFORE this add. */
    const pairingsToOffer = useCallback((cartItemIds: readonly string[]): MenuItem[] => {
        if (!menuEngineeringEnabled && !pairingRulesEnabled) return []
        return postAddOffers(complementaryUpsells, { addedItemId: item.id, cartItemIds })
    }, [menuEngineeringEnabled, pairingRulesEnabled, complementaryUpsells, item.id])

    const openAddedSheet = useCallback((offers: MenuItem[]) => {
        // The sheet says "Added to your order" itself; the toast would sit on its buttons.
        if (addedToastRef.current !== null) toast.dismiss(addedToastRef.current)
        addedToastRef.current = null
        setAddedSheetOffers(offers)
        setIsPostAddUpsellOpen(true)
    }, [setIsPostAddUpsellOpen])

    const handleAddToCart = useCallback((skipNavigation = false) => {
        /*
         * A card that will not open is not a guard. This URL is shareable,
         * indexed, and reachable from a stale cart link, so the page has to
         * refuse on its own rather than trust the menu grid to have filtered.
         */
        if (!isOrderable) {
            toast.error(`${item.name} is out of stock right now.`)
            return
        }
        if (openStatus.isOrderingBlocked) {
            toast.error(
                openStatus.nextOpenLabel
                    ? `${STORE_CLOSED_MESSAGE}. Opens ${openStatus.nextOpenLabel}.`
                    : `${STORE_CLOSED_MESSAGE}.`
            )
            return
        }
        // Check required selections. Modifier-groups path validates via the
        // adapter; the legacy path checks required variation types directly.
        if (useGroups) {
            const result = mg.validate()
            if (!result.valid) {
                toast.error(result.error ?? 'Please complete your selection')
                return
            }
        } else if (useNewVariations && item.variation_types) {
            const missingRequired = item.variation_types.find(
                type => type.is_required && !selectedVariations[type.id]
            )
            if (missingRequired) {
                toast.error(`Please select ${missingRequired.name}`)
                return
            }
        }

        // A presell dish needs a date before anything else, and the number
        // chosen must still fit that date (or the shelf) right now — the
        // stepper cap is advisory, this is the re-check.
        if (isPresell && !presellDate) {
            toast.error(`Please choose a pickup date for ${item.name}.`)
            return
        }
        if (effectiveQuantity > addableQuantity) {
            toast.error(
                addableQuantity <= 0
                    ? `${item.name} is sold out${isPresell && presellDate ? ` for ${formatPresellDateLabel(presellDate)}` : ''}.`
                    : `Only ${addableQuantity} more of ${item.name} can be added.`
            )
            return
        }

        // Add the item to cart
        // Read before the add: this render's cart is the order so far.
        const cartBeforeAdd = cartItems.map((line) => line.menu_item.id)
        // Pairings only. Combos are offered on the item page, BEFORE the add —
        // offering one after left the dish in the cart twice.
        const offers = skipNavigation ? [] : pairingsToOffer(cartBeforeAdd)
        // The sheet says "Added to your order" itself; a toast would sit on its buttons.
        if (!addCurrentItemToCart({ announce: offers.length === 0 })) return

        if (offers.length > 0) {
            openAddedSheet(offers)
            return
        }

        // Sheet mode: upsell data may still be loading. Defer the post-add
        // decision (the deferred-decision effect re-runs once it resolves) so a
        // fast Add-to-Cart tap doesn't skip the upsell screen.
        if (!skipNavigation && isSheet && upsellsPending) {
            pendingPostAddRef.current = cartBeforeAdd
            return
        }

        // No upsells — navigate directly
        if (!skipNavigation) {
            if (buyNowIntentRef.current) {
                buyNowIntentRef.current = false
                router.push(`/${tenant.slug}/cart`)
            } else if (isSheet) {
                // Sheet mode: close the sheet, returning to the menu.
                onClose?.()
            } else {
                router.back()
            }
        }
    }, [useGroups, mg, useNewVariations, item, selectedVariations, addCurrentItemToCart, cartItems, router, pairingsToOffer, openAddedSheet, tenant.slug, buyNowIntentRef, isSheet, onClose, upsellsPending, openStatus.isOrderingBlocked, openStatus.nextOpenLabel, isOrderable, isPresell, presellDate, effectiveQuantity, addableQuantity])

    const handleBuyNow = useCallback(() => {
        buyNowIntentRef.current = true
        handleAddToCart(false) // Go through full upsell flow; navigateAfterUpsells handles checkout redirect
    }, [handleAddToCart, buyNowIntentRef])

    const handleShare = useCallback(async () => {
        try {
            // In sheet mode the address bar still shows /menu, so build the
            // canonical full-page URL for the item being viewed.
            const shareUrl = isSheet
                ? `${window.location.origin}/${tenant.slug}/menu/item/${item.id}`
                : window.location.href
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Link copied!')
        } catch {
            toast.error('Failed to copy link')
        }
    }, [isSheet, tenant.slug, item.id])

    // Sheet mode: when a fast Add-to-Cart deferred its post-add decision, resolve
    // it now that upsell data has loaded — show the upsell screen if any, else
    // close the sheet (or go to cart for buy-now).
    useEffect(() => {
        if (!isSheet || upsellsPending || !pendingPostAddRef.current) return
        const cartBeforeAdd = pendingPostAddRef.current
        pendingPostAddRef.current = null
        const offers = pairingsToOffer(cartBeforeAdd)
        if (offers.length > 0) {
            openAddedSheet(offers)
        } else if (buyNowIntentRef.current) {
            buyNowIntentRef.current = false
            router.push(`/${tenant.slug}/cart`)
        } else {
            onClose?.()
        }
    }, [isSheet, upsellsPending, pairingsToOffer, openAddedSheet, router, tenant.slug, onClose, buyNowIntentRef])

    return (
        <UpsellOrchestratorProvider>
        <motion.div
            animate={isPageTransitioning ? { x: '-100%', opacity: 0 } : { x: 0, opacity: 1 }}
            transition={{ type: 'tween' as const, duration: 0.25, ease: 'easeInOut' as const }}
            className={isSheet ? 'h-full flex flex-col' : 'min-h-screen flex flex-col'}
            style={cssVariables}
        >
            {/* Back Navigation */}
            <header data-branding-scope="product/header" className={`${isSheet ? 'absolute' : 'fixed'} top-0 left-0 right-0 z-50 p-3${isSheet ? ' rounded-t-2xl' : ''}`} style={{ backgroundColor: 'var(--pd-header-background)' }}>
                <div className="flex items-center justify-between gap-2">
                    {isSeniorMode ? (
                        // Senior mode: the icon-only chevron was easy to miss —
                        // say where the button goes, and go there even when
                        // the dish was opened from a shared link (no history).
                        <motion.button
                            onClick={handleGoMenu}
                            className="flex min-h-12 items-center gap-1.5 rounded-full py-2 pl-3 pr-5 text-lg font-bold shadow-md transition-colors"
                            style={{ backgroundColor: 'var(--pd-header-button-bg)', color: 'var(--pd-header-button-icon)' }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <ChevronLeft className="h-7 w-7" aria-hidden="true" />
                            Back to menu
                        </motion.button>
                    ) : (
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
                    )}
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
            <main
                ref={mainContentRef}
                className="flex-1 overflow-y-auto pb-40"
                style={{
                    backgroundColor: 'var(--pd-page-background)',
                    // Stacking context so the z-index:-1 background layers paint
                    // above this opaque page color rather than behind it.
                    ...(isSheet
                        ? {}
                        : buildBackgroundRootStyle(
                            resolveBackgroundOverlay(tenant as unknown as Record<string, unknown>)
                          )),
                }}
            >
                {/* Tenant's custom page background. Skipped in sheet mode, where
                    the storefront underneath already paints it. */}
                {!isSheet && (
                    <BackgroundOverlayLayer tenant={tenant as unknown as Record<string, unknown>} />
                )}
                {/* Product Image - Hero */}
                <div
                    data-branding-scope="product/image"
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
                            data-branding-scope="product/sale-badge"
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
                <div data-branding-scope="product/info" className="relative px-5 py-6" style={{ padding: 'var(--pd-section-padding)' }}>
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
                            data-branding-scope="product/name"
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
                            data-branding-scope="product/description"
                            className="text-center leading-relaxed mb-6"
                            style={dynamicStyles?.description}
                        >
                            {item.description}
                        </p>
                    )}

                    {/* Divider */}
                    {showCustomizations && (
                        <div className="border-t mb-6" style={{ borderColor: 'var(--pd-border)' }} />
                    )}

                    {/* Unified Modifier Groups (Phase 2) — replaces the legacy
                        variation/add-on sections for items authored with the new editor. */}
                    {useGroups && (
                        <div className="mb-6">
                            <ModifierGroupsSelector
                                groups={mg.groups}
                                selection={mg.selection}
                                onToggle={mg.toggle}
                                onQuantityChange={mg.setOptionQuantity}
                                parentQuantity={mg.quantity}
                                hideCurrencySymbol={hideCurrencySymbol}
                            />
                        </div>
                    )}

                    {!useGroups && (
                        <>
                            <ProductVariations
                                variations={item.variations}
                                variationTypes={item.variation_types}
                                selectedVariation={selectedVariation}
                                selectedVariations={selectedVariations}
                                onVariationTypeSelect={handleVariationTypeSelect}
                                onLegacyVariationSelect={handleLegacyVariationSelect}
                                dynamicStyles={dynamicStyles}
                                menuEngineeringEnabled={menuEngineeringEnabled}
                                themeColors={themeColors}
                                isBrandAdmin={isBrandAdmin}
                                onEditBranding={openBrandingEditor}
                            />
                            <ProductAddons
                                addons={mergedAddons}
                                selectedAddons={selectedAddons}
                                onQuantityChange={changeAddonQuantity}
                                hideCurrencySymbol={hideCurrencySymbol}
                                themeColors={themeColors}
                                isBrandAdmin={isBrandAdmin}
                                onEditBranding={openBrandingEditor}
                            />
                        </>
                    )}

                    {/* Presell date picker: a pre-order dish is sold per pickup date. */}
                    {isPresell && (
                        <div className="mt-6" data-branding-scope="product/presell">
                            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--pd-section-title, inherit)' }}>
                                Choose a pickup date
                            </h3>
                            <p className="text-xs text-muted-foreground mb-3">
                                {presellDate
                                    ? `Pre-order for ${formatPresellDateLabel(presellDate)}`
                                    : committedPresellDate
                                        ? `Your cart is for ${formatPresellDateLabel(committedPresellDate)}`
                                        : 'This item is made to order. Pick the date you want it.'}
                            </p>
                            {isPresellLoading ? (
                                <div className="h-40 rounded-2xl bg-black/5 animate-pulse" />
                            ) : (
                                <PresellDatePicker
                                    calendar={presellCalendar}
                                    todayKey={presellTodayKey}
                                    selectedDate={presellDate}
                                    onSelect={setPresellDate}
                                    accentColor={branding.buttonPrimary}
                                />
                            )}
                        </div>
                    )}

                    {/* Upgrade moment: the meal version and this dish's combos, as a choice — never a takeover */}
                    {(menuEngineeringEnabled ? branchUpgrades.length : 0) + itemCombos.length > 0 && (
                        <ItemOffers
                            item={item}
                            upgrades={menuEngineeringEnabled ? branchUpgrades : []}
                            combos={itemCombos}
                            theme={offerTheme}
                            hideCurrencySymbol={hideCurrencySymbol}
                            tenantId={tenant.id}
                            onChooseUpgrade={(upgrade) => {
                                if (isSheet) {
                                    onNavigateToItem?.(upgrade.targetItem, { fromUpgrade: true })
                                    return
                                }
                                pendingNavigationRef.current = `/${tenant.slug}/menu/item/${upgrade.targetItem.id}?upgraded=1`
                                setIsPageTransitioning(true)
                            }}
                            onChooseCombo={(combo) => setBundleForCustomization(combo)}
                        />
                    )}
                    {/* Related Items Section */}
                    {relatedItems.length > 0 && (
                        <div className="relative" data-branding-scope="product/related">
                            <AdminEditPencil
                                visible={isBrandAdmin}
                                onClick={() => openBrandingEditor('related_items')}
                                label="Edit related items branding"
                                className="absolute right-0 top-10 z-10"
                            />
                            <LazyRelatedItemsSection
                                relatedItems={relatedItems}
                                tenantSlug={tenant.slug}
                                onSelectItem={isSheet ? onNavigateToItem : undefined}
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

            {/* Right after adding: "Goes well with" */}
            <AddedSheet
                open={isPostAddUpsellOpen}
                addedItem={item}
                suggestions={addedSheetOffers}
                theme={offerTheme}
                tenantId={tenant.id}
                hideCurrencySymbol={hideCurrencySymbol}
                primaryLabel="View cart"
                onAdd={(upsellItem) => {
                    addItem(upsellItem, undefined, [], 1, undefined, 'suggestion', item.id)
                }}
                onCustomize={(upsellItem) => {
                    setIsPostAddUpsellOpen(false)
                    if (isSheet) {
                        onNavigateToItem?.(upsellItem)
                        return
                    }
                    router.push(`/${tenant.slug}/menu/item/${upsellItem.id}`)
                }}
                onPrimary={() => {
                    setIsPostAddUpsellOpen(false)
                    buyNowIntentRef.current = false
                    router.push(`/${tenant.slug}/cart`)
                }}
                onClose={handlePostAddUpsellClose}
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
                    {/* "Just added" preview (admin only) — the real sheet, with this dish's related items */}
                    <AddedSheet
                        open={isPopupPreviewOpen}
                        addedItem={item}
                        suggestions={relatedItems.length > 0 ? relatedItems.slice(0, 4) : [item]}
                        theme={offerTheme}
                        tenantId={tenant.id}
                        hideCurrencySymbol={hideCurrencySymbol}
                        primaryLabel="View cart"
                        onAdd={() => {}}
                        onCustomize={() => {}}
                        onPrimary={() => setIsPopupPreviewOpen(false)}
                        onClose={() => setIsPopupPreviewOpen(false)}
                    />

                    {/* Cart "last call" preview (admin only) — live with the draft checkout_modal_* colours */}
                    {isCheckoutPreviewOpen && (
                        <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsCheckoutPreviewOpen(false)}>
                            <div className="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
                                <CartOfferRow
                                    title={tenant.checkout_upsell_title?.trim() || 'Add to your order'}
                                    subtitle={tenant.checkout_upsell_subtitle?.trim() || undefined}
                                    items={(relatedItems.length > 0 ? relatedItems.slice(0, 4) : [item]).map((preview) => ({
                                        id: preview.id,
                                        name: preview.name,
                                        priceLabel: formatPrice(preview.price, { hideCurrencySymbol }),
                                        imageUrl: preview.image_url,
                                    }))}
                                    addedIds={new Set()}
                                    theme={cartOfferThemeFromBranding({
                                        ...branding,
                                        checkoutModalBackground: activeCustomization?.checkout_modal_background_color || branding.checkoutModalBackground,
                                        checkoutModalTitle: activeCustomization?.checkout_modal_title_color || branding.checkoutModalTitle,
                                        checkoutModalDescription: activeCustomization?.checkout_modal_description_color || branding.checkoutModalDescription,
                                        checkoutModalButton: activeCustomization?.checkout_modal_button_color || branding.checkoutModalButton,
                                        checkoutModalButtonText: activeCustomization?.checkout_modal_button_text_color || branding.checkoutModalButtonText,
                                        checkoutModalBorder: activeCustomization?.checkout_modal_border_color || branding.checkoutModalBorder,
                                    })}
                                    onAdd={() => {}}
                                />
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Sticky Footer */}
            <footer
                data-branding-scope="product/sticky-footer"
                className={`${isSheet ? 'absolute' : 'fixed'} bottom-0 left-0 right-0 z-40 border-t`}
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
                                    {formatPrice(item.price * effectiveQuantity, { hideCurrencySymbol })}
                                </span>
                            )}
                            <span
                                data-branding-scope="product/total-price"
                                className="text-xl font-bold"
                                style={{ color: 'var(--pd-total-price)' }}
                            >
                                {formatPrice(effectiveTotalPrice, { hideCurrencySymbol })}
                            </span>
                        </div>

                        {/* Quantity Controls */}
                        <div
                            data-branding-scope="product/quantity"
                            className="flex items-center gap-1.5 rounded-full px-1.5"
                            style={{ backgroundColor: 'var(--pd-qty-bg)' }}
                        >
                            <button
                                type="button"
                                onClick={effectiveDecreaseQuantity}
                                disabled={effectiveQuantity <= 1}
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
                                {effectiveQuantity}
                            </span>
                            <button
                                type="button"
                                onClick={effectiveIncreaseQuantity}
                                disabled={!canIncreaseQuantity}
                                className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                                style={{ backgroundColor: 'var(--pd-qty-bg)' }}
                                aria-label="Increase quantity"
                            >
                                <Plus className="h-4 w-4" style={{ color: 'var(--pd-qty-btn)' }} />
                            </button>
                        </div>
                    </div>
                    {/*
                      A disabled + button with no explanation reads as a broken
                      page — the same reasoning as the closed-store banner
                      below. Only shown when stock is actually short; a
                      storefront that cries shortage on every dish trains
                      customers to ignore it on the one that matters.
                    */}
                    {stockHint && (
                        <p className="pt-2 text-right text-xs font-medium text-muted-foreground">
                            {stockHint}
                        </p>
                    )}
                </div>

                <StoreClosedBanner status={openStatus} />
                {/*
                  Disabled buttons alone read as a broken page. Say why, in the
                  same place the closed-store banner says why.
                */}
                {!isOrderable && (
                    <div className="px-5 pt-3">
                        <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                            This item is currently unavailable.
                        </p>
                    </div>
                )}

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
                        data-branding-scope="product/buy-now"
                        onClick={handleBuyNow}
                        disabled={openStatus.isOrderingBlocked || !isOrderable}
                        className="flex-1 h-12 font-semibold text-base border-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={dynamicStyles?.buttonBuyNow}
                    >
                        {themeColors.buyNowButtonLabel}
                    </Button>
                    <Button
                        type="button"
                        data-branding-scope="product/add-to-cart"
                        onClick={() => handleAddToCart(false)}
                        disabled={openStatus.isOrderingBlocked || !isOrderable}
                        className="flex-1 h-12 font-semibold text-base transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        style={dynamicStyles?.buttonAddToCart}
                    >
                        {themeColors.addToCartButtonLabel}
                    </Button>
                </div>
            </footer>

            {isBrandAdmin && !previewDraft && (
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
        </UpsellOrchestratorProvider>
    )
})
