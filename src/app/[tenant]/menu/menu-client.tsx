'use client'

import { useMemo } from 'react'
import { useBrandingPreviewDraft, useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { applyCategoryDraft, type CategoryStudioDraft } from '@/lib/category-studio'
import { getTenantBranding } from '@/lib/branding-utils'
import { OutletGate } from '@/components/customer/outlet-gate'
import { TableLinkCapture } from '@/components/customer/table-link-capture'
import { useStorefrontMenu } from '@/storefront/catalog/use-storefront-menu'
import { STOREFRONT_PACK_PAGES, type StorefrontPackPages } from '@/storefront/packs/registry'
import { getStorefrontPack, resolveStorefrontPack } from '@/lib/storefront-packs'
import { StorefrontRuntime } from '@/storefront/runtime/storefront-runtime'
import type { StorefrontMenuInput } from '@/storefront/contracts'

type StorefrontPage = 'menu' | 'home'
type StorefrontClientProps = StorefrontMenuInput & {
  /** Which pack page to draw. Defaults to the menu. */
  page?: StorefrontPage
}

/**
 * Route adapter for the storefront's menu and home routes. Customer behavior
 * and visual composition have separate homes: the controller comes from
 * useStorefrontMenu, the markup from the tenant's storefront pack.
 */
export function MenuClient(props: StorefrontClientProps) {
  return <MenuEntry key={props.tenant?.id ?? props.tenantSlug} {...props} />
}

function MenuEntry(props: StorefrontClientProps) {
  const tenant = useBrandingPreviewTenant(props.tenant)
  const draft = useBrandingPreviewDraft()
  const categories = useMemo(() => applyCategoryDraft(props.categories,
    (draft?.__categoryDraft ?? null) as CategoryStudioDraft | null), [props.categories, draft])
  const status = props.status ?? (props.error ? (tenant ? 'error' : 'not-found') : 'ready')
  if (status !== 'ready') {
    const branding = getTenantBranding(tenant)
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: branding.background }}>
      <div className="text-center max-w-md mx-auto p-8" role="alert">
        <h1 className="text-2xl font-bold" style={{ color: branding.textPrimary }}>
          {status === 'not-found' ? 'Restaurant not found' : 'Unable to load menu'}
        </h1>
        <p className="my-6" style={{ color: branding.textSecondary }}>
          {status === 'not-found' ? 'This restaurant could not be found.' : "We’re having trouble loading the menu. Please try again."}
        </p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 rounded-full font-semibold"
          style={{ backgroundColor: branding.buttonPrimary, color: branding.buttonPrimaryText }}>Try Again</button>
      </div>
    </div>
  }
  return <ReadyMenu {...props} tenant={tenant} categories={categories} isWelcomePreview={draft?.__previewSurface === 'welcome'} />
}

function ReadyMenu({ isWelcomePreview, page = 'menu', ...props }: StorefrontClientProps & { isWelcomePreview: boolean }) {
  const menu = useStorefrontMenu(props)
  // Resolved from the preview-merged tenant, so the Branding Studio can switch packs live.
  const packId = resolveStorefrontPack(props.tenant)
  const pages: StorefrontPackPages = STOREFRONT_PACK_PAGES[packId]
  const PackPage = (page === 'home' ? pages.home : undefined) ?? pages.menu
  return <>
    <TableLinkCapture tenantSlug={props.tenantSlug} />
    <OutletGate tenant={props.tenant} tenantSlug={props.tenantSlug} outlets={props.outlets} isPreview={isWelcomePreview} />
    <StorefrontRuntime menu={menu} checkoutEntry={getStorefrontPack(packId).checkoutEntry}>
      <PackPage />
    </StorefrontRuntime>
  </>
}
