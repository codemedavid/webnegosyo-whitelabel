import { redirect } from 'next/navigation'

import { getCachedTenantBySlug } from '@/lib/cache'
import { generateBrandingCSS, getTenantBranding } from '@/lib/branding-utils'
import { loadHeroDesign } from '@/lib/hero-builder/load'
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

  return (
    <HeroBuilderEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      initialDesign={initialDesign}
      initialIsLive={customHeroKind(tenant) === 'block'}
      brandStyle={brandStyle}
    />
  )
}
