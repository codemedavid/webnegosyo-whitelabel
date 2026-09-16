'use client'

import { useMemo } from 'react'
import { useBrandingPreviewDraft, useBrandingPreviewTenant } from '@/hooks/use-branding-preview'
import { applyCategoryDraft, type CategoryStudioDraft } from '@/lib/category-studio'
import { getTenantBranding } from '@/lib/branding-utils'
import { OutletGate } from '@/components/customer/outlet-gate'
import { useStorefrontMenu } from '@/storefront/catalog/use-storefront-menu'
import { LegacyMenuStorefront } from '@/storefront/packs/legacy/menu-storefront'
import type { StorefrontMenuInput } from '@/storefront/contracts'

/** Route adapter. Customer behavior and visual composition have separate homes. */
export function MenuClient(props: StorefrontMenuInput) {
  return <MenuEntry key={props.tenant?.id ?? props.tenantSlug} {...props} />
}

function MenuEntry(props: StorefrontMenuInput) {
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

function ReadyMenu({ isWelcomePreview, ...props }: StorefrontMenuInput & { isWelcomePreview: boolean }) {
  const menu = useStorefrontMenu(props)
  return <>
    <OutletGate tenant={props.tenant} tenantSlug={props.tenantSlug} outlets={props.outlets} isPreview={isWelcomePreview} />
    <LegacyMenuStorefront menu={menu} />
  </>
}
