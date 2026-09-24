'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { CategorySubmenu } from '@/components/customer/category-submenu'
import { AnnouncementBar } from '@/components/customer/announcement-bar'
import { StoreClosedBanner } from '@/components/customer/store-closed-banner'
import { MenuLayout } from '@/components/customer/layouts'
import { generateBrandingCSS } from '@/lib/branding-utils'
import { buildHeadingFontCss } from '@/lib/storefront-theme'
import type { CardTemplate } from '@/lib/card-templates'
import { MenuHeaderRenderer } from '@/components/customer/header-templates'
import { getHeaderConfig, type HeaderConfig, type HeaderTemplate } from '@/lib/header-templates'
import type { PageLayout } from '@/lib/page-layouts'
import { BlockHeroRenderer } from '@/components/customer/block-hero-renderer'
import type { HeroBlockDesign } from '@/types/hero-block-designer'
import { useBrandingPreviewDraft, useIsMobileViewport, useMobileOverrides } from '@/hooks/use-branding-preview'
import { resolveMobileGridColumns, resolveStorefrontLayout } from '@/lib/storefront-device-layout'
import { BackgroundOverlayLayer } from '@/components/customer/background-overlay-layer'
import { buildBackgroundRootStyle, resolveBackgroundOverlay } from '@/lib/background-overlay'

import { shouldUseCustomHero } from '@/lib/hero-mode'
import { DeferredMount } from '../../runtime/deferred-mount'
import { useStorefrontRuntime } from '../../runtime/storefront-runtime'

const CartDrawer = dynamic(() => import('@/components/customer/cart-drawer').then(m => ({ default: m.CartDrawer })), { ssr: false })

/**
 * The original storefront: a header template, an optional hero, one of the
 * catalog page layouts and the cart drawer. Shared overlays (product sheet,
 * bundle wizard, active-order banner...) come from StorefrontRuntime.
 */
export function LegacyMenuStorefront() {
  const { menu, branding } = useStorefrontRuntime()
  const { tenant, tenantSlug, allMenuItems, categoriesWithBundles, filteredItems,
    searchQuery, setSearchQuery: handleSearchChange, activeCategory, setActiveCategory,
    itemCount: item_count, openStatus, isCartOpen, selectItem: handleItemSelect } = menu
  const isCartPreview = useBrandingPreviewDraft()?.__previewSurface === 'cart'
  const mobileOverrides = useMobileOverrides(tenant)
  const isMobile = useIsMobileViewport()
  const [currentSlide, setCurrentSlide] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const deviceLayout = resolveStorefrontLayout(tenant, mobileOverrides)
  const layout = (isMobile ? deviceLayout.mobileLayout : deviceLayout.desktopLayout) as PageLayout
  const card = (isMobile ? deviceLayout.mobileCard : deviceLayout.desktopCard) as CardTemplate
  const header = (isMobile ? deviceLayout.mobileHeader : deviceLayout.desktopHeader) as HeaderTemplate
  const headerConfig = useMemo<HeaderConfig>(() => getHeaderConfig(tenant), [tenant])
  const layoutBranding = useMemo(() => headerConfig.showSearch
    ? { ...branding, searchBar: { ...branding.searchBar, enabled: false } }
    : branding, [branding, headerConfig.showSearch])
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
  }, [header, headerConfig])

  useEffect(() => {
    const promotionBanners = tenant?.promotion_banners ?? []
    const isVisible = tenant?.is_promotion_visible
    if (!isVisible || promotionBanners.length <= 1) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promotionBanners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [tenant?.is_promotion_visible, tenant?.promotion_banners])

  return (
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

      <AnnouncementBar tenant={tenant} />
      <StoreClosedBanner status={openStatus} />
      <MenuHeaderRenderer
        template={header} tenant={tenant} tenantSlug={tenantSlug} branding={branding}
        config={headerConfig} itemCount={item_count} onCartClick={menu.openCart}
        searchQuery={searchQuery} onSearchChange={handleSearchChange}
      />
      {layout === 'default' && categoriesWithBundles.length > 0 && (
        <CategorySubmenu categories={categoriesWithBundles} activeCategory={activeCategory}
          onCategoryChange={setActiveCategory} branding={branding} />
      )}

      {/* Block Hero (v4) — rendered at the top level, above <main> content */}
      {(() => {
        const heroDesign = tenant?.hero_design as Record<string, unknown> | null
        const isBlockDesign = heroDesign && heroDesign.version === 4
        if (tenant?.hero_section_enabled !== false && shouldUseCustomHero(tenant) && heroDesign && isBlockDesign) {
          return <BlockHeroRenderer design={heroDesign as unknown as HeroBlockDesign} />
        }
        return null
      })()}

      <main className={
        tenant?.hero_section_enabled !== false && shouldUseCustomHero(tenant) && tenant?.hero_design && (tenant.hero_design as Record<string, unknown>).layoutMode === 'fullscreen'
          ? 'container mx-auto px-4 pb-12'
          : 'container mx-auto px-4 py-12'
      }>
        <MenuLayout
          layout={layout} tenant={tenant} tenantSlug={tenantSlug} categories={categoriesWithBundles}
          filteredItems={filteredItems} searchItems={menu.searchItems} allMenuItems={allMenuItems} activeCategory={activeCategory}
          setActiveCategory={setActiveCategory} searchQuery={searchQuery} setSearchQuery={handleSearchChange}
          onItemSelect={handleItemSelect} branding={layoutBranding} cardTemplate={card}
          isLoading={false} currentSlide={currentSlide} setCurrentSlide={setCurrentSlide}
          mobileGridColumns={resolveMobileGridColumns(tenant?.mobile_grid_columns)}
          menuEngineeringEnabled={tenant?.menu_engineering_enabled}
          hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
        />
      </main>


      <DeferredMount active={isCartOpen || isCartPreview}><CartDrawer
        open={isCartOpen || isCartPreview}
        onClose={menu.closeCart}
        tenantSlug={tenantSlug}
        branding={branding}
        tenant={tenant}
        tenantId={tenant?.id}
        menuEngineeringEnabled={tenant?.menu_engineering_enabled}
        checkoutUpsellEnabled={tenant?.checkout_upsell_enabled}
        checkoutUpsellTitle={tenant?.checkout_upsell_title}
        checkoutUpsellSubtitle={tenant?.checkout_upsell_subtitle}
        checkoutUpsellMaxItems={tenant?.checkout_upsell_max_items}
      /></DeferredMount>
    </div>
  )
}
