'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ActiveOrderBanner } from '@/components/customer/active-order-banner'
import { BrandingInspector } from '@/components/customer/branding-inspector'
import { FlashScreenLoader } from '@/components/customer/flash-screen-loader'
import { useBrandingPreviewDraft } from '@/hooks/use-branding-preview'
import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'
import { buildFlashScreenBranding } from '@/lib/flash-loader'
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
}

const StorefrontRuntimeContext = createContext<StorefrontRuntimeValue | null>(null)

/** The controller and tenant branding for the storefront pack being rendered. */
export function useStorefrontRuntime(): StorefrontRuntimeValue {
  const value = useContext(StorefrontRuntimeContext)
  if (!value) throw new Error('useStorefrontRuntime must be used inside <StorefrontRuntime>')
  return value
}

/**
 * Everything a storefront needs around its pages, whichever pack draws them:
 * the product sheet, the bundle wizard, the active-order banner, the Branding
 * Studio inspector and the flash-screen preview. A pack renders only its own
 * markup (as `children`) and reads the controller from `useStorefrontRuntime`,
 * so a new pack cannot forget one of these.
 */
export function StorefrontRuntime({ menu, children }: { menu: StorefrontMenuController; children: ReactNode }) {
  const { tenant, tenantSlug, categories, allMenuItems, selectedBundle, sheetItem } = menu
  const branding = useMemo(() => getTenantBranding(tenant), [tenant])
  const value = useMemo(() => ({ menu, branding }), [menu, branding])
  const isFlashPreview = useBrandingPreviewDraft()?.__previewSurface === 'flash'

  return (
    <StorefrontRuntimeContext.Provider value={value}>
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

        <ActiveOrderBanner
          tenantSlug={tenantSlug}
          primaryColor={branding.buttonPrimary}
          primaryTextColor={branding.buttonPrimaryText}
        />
      </div>
    </StorefrontRuntimeContext.Provider>
  )
}
