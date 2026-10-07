import { redirect } from 'next/navigation'

import { getCachedTenantBySlug } from '@/lib/cache'
import { generateBrandingCSS, getTenantBranding } from '@/lib/branding-utils'
import { buildLinkCatalog } from '@/lib/hero-builder/link-catalog'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { customHeroKind } from '@/lib/hero-mode'
import { HeroBuilderEditor } from '@/components/hero-builder/editor/hero-builder-editor'

export const metadata = {
  title: 'Hero Builder',
}

export default async function HeroBuilderPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) redirect('/')

  // `hero_design` is TEXT (a JSON string). v4 designs open converted to v5;
  // they are only rewritten when the merchant publishes.
  const initialDesign = loadHeroDesign(tenant.hero_design)
  const brandStyle = generateBrandingCSS(getTenantBranding(tenant as unknown as Record<string, unknown>))
  // Link targets come from the menu customers actually see (cached read).
  const menu = await getStorefrontMenu(tenantSlug)
  const linkCatalog = buildLinkCatalog(menu.categories, menu.menuItems)

  return (
    <HeroBuilderEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      initialDesign={initialDesign}
      initialIsLive={customHeroKind(tenant) === 'block'}
      brandStyle={brandStyle}
      linkCatalog={linkCatalog}
    />
  )
}
