'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CategorySubmenu } from '@/components/customer/category-submenu'
import { CartDrawer } from '@/components/customer/cart-drawer'
import { AnnouncementBar } from '@/components/customer/announcement-bar'
import { StoreClosedBanner } from '@/components/customer/store-closed-banner'
import { useStoreOpenStatus } from '@/hooks/use-store-open-status'
import { STORE_CLOSED_MESSAGE } from '@/lib/store-open-status'
import { resolveOutletAvailability } from '@/lib/outlets/outlet-availability'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { MenuLayout } from '@/components/customer/layouts'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding, generateBrandingCSS } from '@/lib/branding-utils'
import { buildHeadingFontCss } from '@/lib/storefront-theme'
import { toast } from 'sonner'
import type { Category, MenuItem, Tenant, Outlet } from '@/types/database'
import type { CardTemplate } from '@/lib/card-templates'
import { MenuHeaderRenderer } from '@/components/customer/header-templates'
import { getHeaderConfig, type HeaderConfig, type HeaderTemplate } from '@/lib/header-templates'
import type { PageLayout } from '@/lib/page-layouts'
import type { BundleWithSlots } from '@/types/database'
import { bundleToMenuItem, isBundleMenuItem } from '@/lib/bundle-adapter'
import { BlockHeroRenderer } from '@/components/customer/block-hero-renderer'
import type { HeroBlockDesign } from '@/types/hero-block-designer'
import { ActiveOrderBanner } from '@/components/customer/active-order-banner'
import { useBrandingPreviewDraft, useBrandingPreviewTenant, useMobileOverrides } from '@/hooks/use-branding-preview'
import { resolveStorefrontLayout } from '@/lib/storefront-device-layout'
import { FlashScreenLoader } from '@/components/customer/flash-screen-loader'
import { BackgroundOverlayLayer } from '@/components/customer/background-overlay-layer'
import { buildBackgroundRootStyle, resolveBackgroundOverlay } from '@/lib/background-overlay'
import { buildFlashScreenBranding } from '@/lib/flash-loader'
import { OutletGate } from '@/components/customer/outlet-gate'

interface MenuClientProps {
  tenant: Tenant | null
  categories: Category[]
  allMenuItems: MenuItem[]
  bundles: BundleWithSlots[]
  outlets: Outlet[]
  /** True when the branch query failed — ordering is blocked, the menu is not. */
  outletsFailed?: boolean
  tenantSlug: string
  isBrandAdmin: boolean
  error: string | null
}

// Heavy modals — loaded lazily since they are not visible on initial render.
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)
const ProductDetailSheet = dynamic(
  () => import('@/components/customer/product-detail-sheet').then((m) => ({ default: m.ProductDetailSheet })),
  { ssr: false }
)


export function MenuClient({ tenant: tenantProp, categories, allMenuItems, bundles, outlets, outletsFailed, tenantSlug, isBrandAdmin, error }: MenuClientProps) {
  // Branding Studio live preview: when this page runs inside the editor's
  // iframe (?brandingPreview=1) the unsaved draft merges over the tenant so
  // every branding consumer below re-renders in real time.
  const tenant = useBrandingPreviewTenant(tenantProp)
  // Which fields carry a distinct mobile value (empty on a desktop viewport).
  const mobileOverrides = useMobileOverrides(tenantProp)
  const previewDraft = useBrandingPreviewDraft()
  const isFlashPreview = previewDraft?.__previewSurface === 'flash'
  // Branding Studio "Cart" surface previews the real drawer over the menu.
  const isCartPreview = previewDraft?.__previewSurface === 'cart'
  const router = useRouter()
  const { addItem, item_count, setTenantContext } = useCart()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value)
    }, 200)
  }, [])

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<BundleWithSlots | null>(null)
  // The item shown in the product-detail bottom sheet (null = closed).
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  // The branded flash now serves as the real loading state via each route's
  // loading.tsx (see TenantFlashLoading), so the menu no longer runs its own
  // timed once-per-session overlay. We only render it here for the Branding
  // Studio "flash" surface preview.

  useEffect(() => {
    if (tenant) {
      setTenantContext(tenant.id, tenant.slug)
    }
  }, [tenant, setTenantContext])

  // Virtual "Bundles" category + adapted bundle items
  const { categoriesWithBundles, allItemsWithBundles } = useMemo(() => {
    if (bundles.length === 0) {
      return { categoriesWithBundles: categories, allItemsWithBundles: allMenuItems }
    }

    const bundleCategory: Category = {
      id: 'bundles',
      tenant_id: tenant?.id ?? '',
      name: 'Bundles',
      description: 'Special bundle deals',
      order: -1,
      is_active: true,
      display_layout: 'grid' as const,
      created_at: '',
      updated_at: '',
    }

    const bundleMenuItems = bundles.map((b) => bundleToMenuItem(b, allMenuItems))

    return {
      categoriesWithBundles: [bundleCategory, ...categories],
      allItemsWithBundles: [...bundleMenuItems, ...allMenuItems],
    }
  }, [bundles, categories, allMenuItems, tenant?.id])

  const filteredItems = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    const items = allItemsWithBundles.filter((item) => {
      if (activeCategory && item.category_id !== activeCategory) {
        return false
      }

      if (!query) {
        return true
      }

      return (
        item.name.toLowerCase().includes(query) ||
        (item.description ?? '').toLowerCase().includes(query)
      )
    })

    return [...items].sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1
      if (!a.is_featured && b.is_featured) return 1
      if (tenant?.menu_engineering_enabled) {
        const aIsStar = a.bcg_classification === 'star'
        const bIsStar = b.bcg_classification === 'star'
        if (aIsStar && !bIsStar) return -1
        if (!aIsStar && bIsStar) return 1
      }
      return a.order - b.order
    })
  }, [allItemsWithBundles, activeCategory, debouncedSearchQuery, tenant?.menu_engineering_enabled])

  // Branding (incl. any live Branding Studio draft) resolves straight from the
  // merged tenant — the old modal editor's per-field override states are gone.
  const branding = useMemo(() => getTenantBranding(tenant), [tenant])
  const [currentSlide, setCurrentSlide] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Operating-hours enforcement. Resolves after mount (the page is ISR-cached, so
  // the server's answer would be stale) and re-checks every minute.
  const openStatus = useStoreOpenStatus(tenant)

  // A multi-branch storefront that could not load its branches must not quietly
  // serve the single-location flow — that is how an order reaches the wrong
  // kitchen (Phase 1, Decision E). The menu still renders; ordering is what stops.
  const outletAvailability = resolveOutletAvailability({
    isEnabled: isMultiBranchEnabled(tenant),
    didLoadFail: Boolean(outletsFailed),
    outletCount: outlets.length,
  })

  // Stable callback: prevents entire card grid from re-rendering on unrelated state changes
  const handleItemSelect = useCallback((item: MenuItem) => {
    if (!outletAvailability.canOrder) {
      toast.error(outletAvailability.message ?? '')
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
    if (isBundleMenuItem(item)) {
      setSelectedBundle(item._bundleData)
      return
    }
    const hasCustomizations =
      item.variations.length > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      item.addons.length > 0
    // Only skip the sheet for a bare item when NO upsell surface applies — the
    // sheet is also where pairing-rule and bundle upsells render, so those flags
    // must keep an otherwise-customization-free item routed through it.
    const hasUpsellSurface =
      tenant?.menu_engineering_enabled ||
      tenant?.pairing_rules_enabled ||
      tenant?.bundles_enabled
    if (!hasCustomizations && !hasUpsellSurface) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else if (isBrandAdmin) {
      // Brand admins keep navigating to the full page so the inline branding
      // editor and product-detail customizer remain available.
      router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
    } else {
      // Customers get the instant bottom sheet instead of a route navigation.
      setSheetItem(item)
    }
  }, [tenant?.menu_engineering_enabled, tenant?.pairing_rules_enabled, tenant?.bundles_enabled, addItem, router, tenantSlug, isBrandAdmin, openStatus.isOrderingBlocked, openStatus.nextOpenLabel, outletAvailability.canOrder, outletAvailability.message])

  // Device resolution: the Branding Studio's per-device choice wins over any
  // legacy mobile_* column, which in turn wins over the desktop column.
  const deviceLayout = resolveStorefrontLayout(tenant, mobileOverrides)
  const desktopLayout = deviceLayout.desktopLayout as PageLayout
  const mobileLayout = deviceLayout.mobileLayout as PageLayout
  const desktopCard = deviceLayout.desktopCard as CardTemplate
  const mobileCard = deviceLayout.mobileCard as CardTemplate
  const needsDualRender = deviceLayout.needsDualRender

  const desktopHeader = deviceLayout.desktopHeader as HeaderTemplate
  const mobileHeader = deviceLayout.mobileHeader as HeaderTemplate
  const headerConfig = useMemo<HeaderConfig>(() => getHeaderConfig(tenant), [tenant])

  // When the header carries its own inline search, suppress the layout's search bar
  // so the menu never shows two search inputs.
  const layoutBranding = useMemo(() => {
    if (!headerConfig.showSearch) return branding
    return { ...branding, searchBar: { ...branding.searchBar, enabled: false } }
  }, [branding, headerConfig.showSearch])

  // Measure the live header height and expose it as --menu-header-h so the sticky
  // category bars sit flush beneath whichever header template/height the tenant picked
  // (and beneath whichever of the desktop/mobile headers is currently visible).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      // A non-sticky header scrolls away, so the category bar should pin at the very
      // top rather than reserving the (now-absent) header's height.
      if (!headerConfig.sticky) {
        root.style.setProperty('--menu-header-h', '0px')
        return
      }
      let max = 0
      root.querySelectorAll(':scope > header').forEach((el) => {
        const h = (el as HTMLElement).offsetHeight
        if (h > max) max = h
      })
      if (max > 0) root.style.setProperty('--menu-header-h', `${max}px`)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (observer) root.querySelectorAll(':scope > header').forEach((el) => observer.observe(el))
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [desktopHeader, mobileHeader, headerConfig])

  useEffect(() => {
    const promotionBanners = tenant?.promotion_banners ?? []
    const isVisible = tenant?.is_promotion_visible
    if (!isVisible || promotionBanners.length <= 1) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promotionBanners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [tenant?.is_promotion_visible, tenant?.promotion_banners])

  if (error === 'Restaurant not found') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: branding.background }}
      >
        <div className="text-center max-w-md mx-auto p-8">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">😞</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600 mb-6">
            The restaurant you&apos;re looking for doesn&apos;t exist or may have been removed.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: branding.buttonPrimary,
              color: branding.buttonPrimaryText
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (error === 'Failed to load menu data') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: branding.background }}
      >
        <div className="text-center max-w-md mx-auto p-8">
          <div className="h-20 w-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">😞</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-600 mb-6">
            We&apos;re having trouble loading the menu. Please try again later.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-full font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: branding.buttonPrimary,
              color: branding.buttonPrimaryText
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <OutletGate tenant={tenant} tenantSlug={tenantSlug} outlets={outlets} />
    <div
      ref={rootRef}
      data-branding-scope="global/palette"
      className="storefront-themed min-h-screen"
      style={{
        // Expose all --brand-* tokens (incl. the storefront theme knobs:
        // --brand-radius / --brand-heading-font / --brand-body-font when set).
        ...generateBrandingCSS(branding),
        backgroundColor: branding.background,
        // Establish a stacking context so the z-index:-1 background layers
        // paint above this opaque page color instead of behind it.
        ...buildBackgroundRootStyle(resolveBackgroundOverlay(tenant as Record<string, unknown> | null)),
        // Apply the chosen body font pairing storefront-wide; unset = inherit.
        ...(branding.bodyFont ? { fontFamily: branding.bodyFont } : {}),
      }}
    >
      {branding.headingFont && (
        // Headings otherwise inherit the body font; this applies the pairing's
        // display font/weight to headings. Scoped to this storefront root only.
        <style dangerouslySetInnerHTML={{ __html: buildHeadingFontCss('.storefront-themed') }} />
      )}
      <BackgroundOverlayLayer tenant={tenant as Record<string, unknown> | null} />
      {isFlashPreview && (
        <FlashScreenLoader branding={buildFlashScreenBranding(tenant)} />
      )}

      <AnnouncementBar tenant={tenant} />
      <StoreClosedBanner status={openStatus} />
      {desktopHeader === mobileHeader ? (
        <MenuHeaderRenderer
          template={desktopHeader}
          tenant={tenant}
          tenantSlug={tenantSlug}
          branding={branding}
          config={headerConfig}
          itemCount={item_count}
          onCartClick={() => setIsCartOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
        />
      ) : (
        <>
          {/* Responsive class goes on the <header> itself (not a wrapper) so
              position: sticky keeps working — a sticky element nested in a
              short wrapper div would scroll away immediately. */}
          <MenuHeaderRenderer
            template={mobileHeader}
            className="md:hidden"
            tenant={tenant}
            tenantSlug={tenantSlug}
            branding={branding}
            config={headerConfig}
            itemCount={item_count}
            onCartClick={() => setIsCartOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />
          <MenuHeaderRenderer
            template={desktopHeader}
            className="hidden md:block"
            tenant={tenant}
            tenantSlug={tenantSlug}
            branding={branding}
            config={headerConfig}
            itemCount={item_count}
            onCartClick={() => setIsCartOpen(true)}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />
        </>
      )}

      {categoriesWithBundles.length > 0 && (
        needsDualRender ? (
          <>
            {desktopLayout === 'default' && (
              <div className="hidden md:block">
                <CategorySubmenu
                  categories={categoriesWithBundles}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  branding={branding}
                />
              </div>
            )}
            {mobileLayout === 'default' && (
              <div className="md:hidden">
                <CategorySubmenu
                  categories={categoriesWithBundles}
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  branding={branding}
                />
              </div>
            )}
          </>
        ) : desktopLayout === 'default' ? (
          <CategorySubmenu
            categories={categoriesWithBundles}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            branding={branding}
          />
        ) : null
      )}

      {/* Block Hero (v4) — rendered at the top level, above <main> content */}
      {(() => {
        const heroDesign = tenant?.hero_design as Record<string, unknown> | null
        const isBlockDesign = heroDesign && heroDesign.version === 4
        if (tenant?.hero_section_enabled !== false && heroDesign && isBlockDesign) {
          return <BlockHeroRenderer design={heroDesign as unknown as HeroBlockDesign} />
        }
        return null
      })()}

      <main className={
        tenant?.hero_section_enabled !== false && tenant?.hero_design && (tenant.hero_design as Record<string, unknown>).layoutMode === 'fullscreen'
          ? 'container mx-auto px-4 pb-12'
          : 'container mx-auto px-4 py-12'
      }>
        {needsDualRender ? (
          <>
            <div className="md:hidden">
              <MenuLayout
                layout={mobileLayout}
                tenant={tenant}
                tenantSlug={tenantSlug}
                categories={categoriesWithBundles}
                filteredItems={filteredItems}
                allMenuItems={allMenuItems}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                searchQuery={searchQuery}
                setSearchQuery={handleSearchChange}
                onItemSelect={handleItemSelect}
                branding={layoutBranding}
                cardTemplate={mobileCard}
                isLoading={false}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                mobileGridColumns={tenant?.mobile_grid_columns || 1}
                menuEngineeringEnabled={tenant?.menu_engineering_enabled}
                hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
              />
            </div>
            <div className="hidden md:block">
              <MenuLayout
                layout={desktopLayout}
                tenant={tenant}
                tenantSlug={tenantSlug}
                categories={categoriesWithBundles}
                filteredItems={filteredItems}
                allMenuItems={allMenuItems}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                searchQuery={searchQuery}
                setSearchQuery={handleSearchChange}
                onItemSelect={handleItemSelect}
                branding={layoutBranding}
                cardTemplate={desktopCard}
                isLoading={false}
                currentSlide={currentSlide}
                setCurrentSlide={setCurrentSlide}
                mobileGridColumns={tenant?.mobile_grid_columns || 1}
                menuEngineeringEnabled={tenant?.menu_engineering_enabled}
                hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
              />
            </div>
          </>
        ) : (
          <MenuLayout
            layout={desktopLayout}
            tenant={tenant}
            tenantSlug={tenantSlug}
            categories={categoriesWithBundles}
            filteredItems={filteredItems}
            allMenuItems={allMenuItems}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            searchQuery={searchQuery}
            setSearchQuery={handleSearchChange}
            onItemSelect={handleItemSelect}
            branding={layoutBranding}
            cardTemplate={desktopCard}
            isLoading={false}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            mobileGridColumns={tenant?.mobile_grid_columns || 1}
            menuEngineeringEnabled={tenant?.menu_engineering_enabled}
            hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
          />
        )}
      </main>



      <CartDrawer
        open={isCartOpen || isCartPreview}
        onClose={() => setIsCartOpen(false)}
        tenantSlug={tenantSlug}
        branding={branding}
        tenant={tenant}
        tenantId={tenant?.id}
        menuEngineeringEnabled={tenant?.menu_engineering_enabled}
        checkoutUpsellEnabled={tenant?.checkout_upsell_enabled}
        checkoutUpsellTitle={tenant?.checkout_upsell_title}
        checkoutUpsellSubtitle={tenant?.checkout_upsell_subtitle}
        checkoutUpsellMaxItems={tenant?.checkout_upsell_max_items}
      />

      {/* Bundle Wizard */}
      <BundleWizard
        open={!!selectedBundle}
        onClose={() => setSelectedBundle(null)}
        bundle={selectedBundle}
        branding={branding}
        hideCurrencySymbol={tenant?.hide_currency_symbol}
      />

      {/* Product Detail Bottom Sheet (customer fast path — opens instantly from
          in-memory menu data, lazy-fetches upsells/settings in the background) */}
      {tenant && (
        <ProductDetailSheet
          open={!!sheetItem}
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          tenant={tenant}
          branding={branding}
          categories={categories}
          allMenuItems={allMenuItems}
          menuEngineeringEnabled={tenant.menu_engineering_enabled}
          pairingRulesEnabled={tenant.pairing_rules_enabled}
          bundlesEnabled={tenant.bundles_enabled}
          hideCurrencySymbol={!!(tenant.menu_engineering_enabled && tenant.hide_currency_symbol)}
        />
      )}

      {/* Branding Studio click-to-inspect (dormant outside the editor iframe) */}
      <BrandingInspector />

      {/* Active Order Banner */}
      <ActiveOrderBanner
        tenantSlug={tenantSlug}
        primaryColor={branding.buttonPrimary}
        primaryTextColor={branding.buttonPrimaryText}
      />
    </div>
    </>
  )
}
