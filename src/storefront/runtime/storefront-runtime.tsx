'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ActiveOrderBanner } from '@/components/customer/active-order-banner'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { useSeniorMode } from '@/components/customer/senior-mode/senior-mode-provider'
import { SeniorCartBar } from '@/components/customer/senior-mode/senior-cart-bar'
import { FlashScreenLoader } from '@/components/customer/flash-screen-loader'
import { CheckoutUpsellModal } from '@/components/customer/checkout-upsell-modal'
import { CHECKOUT_UPSELL_DEFAULTS } from '@/lib/checkout-upsell-defaults'
import { useBrandingPreviewDraft } from '@/hooks/use-branding-preview'
import { useCart } from '@/hooks/useCart'
import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'
import { buildFlashScreenBranding } from '@/lib/flash-loader'
import type { StorefrontCheckoutEntry } from '@/lib/storefront-packs'
import { useCartCheckout } from '../cart/use-cart-checkout'
import { DeferredMount } from './deferred-mount'
import type { StorefrontMenuController } from '../contracts'

// Heavy overlays — loaded lazily since they are not visible on initial render.
const BundleWizard = dynamic(
  () => import('@/components/customer/bundle-wizard').then((m) => ({ default: m.BundleWizard })),
  { ssr: false }
)
const ProductDetailSheet = dynamic(
  () => import('@/components/customer/product-detail-sheet').then((m) => ({ default: m.ProductDetailSheet })),
  { ssr: false }
)

export interface StorefrontRuntimeValue {
  menu: StorefrontMenuController
  branding: BrandingColors
  /**
   * Go to checkout through the shared gate: refused while the store is closed,
   * and routed through the checkout upsell interstitial when it is enabled.
   */
  requestCheckout: () => void
  /** True while the checkout route is loading after a request. */
  isCheckoutPending: boolean
}

const StorefrontRuntimeContext = createContext<StorefrontRuntimeValue | null>(null)

/** The controller and tenant branding for the storefront pack being rendered. */
export function useStorefrontRuntime(): StorefrontRuntimeValue {
  const value = useContext(StorefrontRuntimeContext)
  if (!value) throw new Error('useStorefrontRuntime must be used inside <StorefrontRuntime>')
  return value
}

/**
 * Reserve space at the bottom of a phone screen for a pack's fixed bar (a tab
 * bar, a "View order" bar), so the active-order banner and the site footer sit
 * above it instead of underneath. Desktop keeps no inset.
 */
export function StorefrontBottomInset({ mobilePx }: { mobilePx: number }) {
  return <style>{`@media (max-width: 767px){:root{--storefront-bottom-inset:${mobilePx}px}}`}</style>
}

interface StorefrontRuntimeProps {
  menu: StorefrontMenuController
  /**
   * How the pack reaches checkout. A 'cart-drawer' pack's drawer runs the
   * checkout gate itself; for a 'direct' pack the runtime runs it (prefetch,
   * closed-store refusal, upsell interstitial) and hands out requestCheckout.
   */
  checkoutEntry?: StorefrontCheckoutEntry
  children: ReactNode
}

/**
 * Everything a storefront needs around its pages, whichever pack draws them:
 * the product sheet, the bundle wizard, the active-order banner, the Branding
 * Studio inspector, the flash-screen preview and — for packs without a cart
 * drawer — the checkout gate. A pack renders only its own markup (as
 * `children`) and reads the controller from `useStorefrontRuntime`, so a new
 * pack cannot forget one of these.
 */
/** A drawer pack's "checkout" is its cart drawer, whose own gate takes it from there. */
function DrawerCheckoutProvider({ menu, branding, children }: { menu: StorefrontMenuController; branding: BrandingColors; children: ReactNode }) {
  const { openCart } = menu
  const value = useMemo(
    () => ({ menu, branding, requestCheckout: openCart, isCheckoutPending: false }),
    [menu, branding, openCart]
  )
  return <StorefrontRuntimeContext.Provider value={value}>{children}</StorefrontRuntimeContext.Provider>
}

/**
 * The checkout gate for packs that go straight to checkout: prefetch while the
 * cart has items, the closed-store refusal and the upsell interstitial.
 */
function DirectCheckoutProvider({ menu, branding, children }: { menu: StorefrontMenuController; branding: BrandingColors; children: ReactNode }) {
  const { tenant, tenantSlug } = menu
  const { items, bundleItems } = useCart()
  const hasItems = items.length + bundleItems.length > 0
  const checkout = useCartCheckout({ tenant, tenantSlug, items, hasItems, enabled: hasItems })
  const { requestCheckout, isNavigating } = checkout
  const value = useMemo(
    () => ({ menu, branding, requestCheckout, isCheckoutPending: isNavigating }),
    [menu, branding, requestCheckout, isNavigating]
  )
  return (
    <StorefrontRuntimeContext.Provider value={value}>
      {children}
      {checkout.showInterstitial && tenant && (
        <CheckoutUpsellModal
          open={checkout.showUpsellModal}
          onContinue={checkout.onUpsellContinue}
          tenantId={tenant.id}
          branding={branding}
          title={tenant.checkout_upsell_title || CHECKOUT_UPSELL_DEFAULTS.title}
          subtitle={tenant.checkout_upsell_subtitle || CHECKOUT_UPSELL_DEFAULTS.subtitle}
          maxItems={tenant.checkout_upsell_max_items || CHECKOUT_UPSELL_DEFAULTS.maxItems}
          prefetchedItems={checkout.prefetchedItems ?? undefined}
        />
      )}
    </StorefrontRuntimeContext.Provider>
  )
}

export function StorefrontRuntime({ menu, checkoutEntry = 'cart-drawer', children }: StorefrontRuntimeProps) {
  const { tenant, tenantSlug, categories, allMenuItems, selectedBundle, sheetItem } = menu
  const branding = useMemo(() => getTenantBranding(tenant), [tenant])
  const isFlashPreview = useBrandingPreviewDraft()?.__previewSurface === 'flash'
  const isSeniorMode = useSeniorMode()
  // Only direct-checkout packs mount a gate here; a drawer pack's drawer runs
  // its own, and a second one would add another open-hours poller.
  const CheckoutProvider = checkoutEntry === 'direct' ? DirectCheckoutProvider : DrawerCheckoutProvider

  return (
    <CheckoutProvider menu={menu} branding={branding}>
      {children}

      {/* `display: contents` adds no box, but the overlays still inherit the
          tenant's body font as they did inside a pack's themed root. */}
      <div className="contents" style={branding.bodyFont ? { fontFamily: branding.bodyFont } : undefined}>
        {isFlashPreview && <FlashScreenLoader branding={buildFlashScreenBranding(tenant)} />}

        <DeferredMount active={!!selectedBundle}>
          <BundleWizard
            open={!!selectedBundle}
            onClose={menu.closeBundle}
            bundle={selectedBundle}
            branding={branding}
            hideCurrencySymbol={tenant?.hide_currency_symbol}
          />
        </DeferredMount>

        {/* Customer fast path: opens instantly from in-memory menu data and
            lazy-fetches upsells/settings in the background. */}
        {tenant && (
          <DeferredMount active={!!sheetItem}>
            <ProductDetailSheet
              open={!!sheetItem}
              item={sheetItem}
              onClose={menu.closeProduct}
              tenant={tenant}
              branding={branding}
              categories={categories}
              allMenuItems={allMenuItems}
              menuEngineeringEnabled={tenant.menu_engineering_enabled}
              pairingRulesEnabled={tenant.pairing_rules_enabled}
              bundlesEnabled={tenant.bundles_enabled}
              hideCurrencySymbol={!!(tenant.menu_engineering_enabled && tenant.hide_currency_symbol)}
            />
          </DeferredMount>
        )}

        {/* Branding Studio click-to-inspect (dormant outside the editor iframe) */}
        <BrandingInspector />

        {/* Senior mode: large labelled cart bar pinned to the bottom */}
        {isSeniorMode && (
          <SeniorCartBar
            tenantSlug={tenantSlug}
            branding={branding}
            hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
          />
        )}

        <ActiveOrderBanner
          tenantSlug={tenantSlug}
          primaryColor={branding.buttonPrimary}
          primaryTextColor={branding.buttonPrimaryText}
          isRaised={isSeniorMode}
        />

      </div>
    </CheckoutProvider>
  )
}
