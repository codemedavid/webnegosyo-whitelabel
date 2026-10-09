import { redirect } from 'next/navigation'

import { getCachedTenantBySlug } from '@/lib/cache'
import { generateBrandingCSS, getTenantBranding } from '@/lib/branding-utils'
import { loadHeroDesign } from '@/lib/hero-builder/load'
import { getEnabledOrderTypesByTenant } from '@/lib/order-types-service'
import { shouldGateMenuForOutlet } from '@/lib/outlets/selection-timing'
import { getStorefrontMenu } from '@/lib/storefront/storefront-menu'
import { resolveWelcomeModes } from '@/lib/welcome-builder/modes'
import { hasCustomWelcome } from '@/lib/welcome-builder/welcome-mode'
import { WelcomeBuilderEditor } from '@/components/hero-builder/editor/welcome-builder-editor'

export const metadata = {
  title: 'Welcome Builder',
}

export default async function WelcomeBuilderPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) redirect('/')

  // `welcome_design` is TEXT (a JSON string), like hero_design.
  const initialDesign = loadHeroDesign(tenant.welcome_design)
  const brandStyle = generateBrandingCSS(getTenantBranding(tenant as unknown as Record<string, unknown>))
  const [menu, orderTypes] = await Promise.all([
    getStorefrontMenu(tenantSlug),
    // A failed read only costs the preview its real tiles (the sample set shows).
    getEnabledOrderTypesByTenant(tenant.id).catch(() => []),
  ])
  const modes = resolveWelcomeModes({
    isBranchChooser: shouldGateMenuForOutlet(tenant, menu.outlets),
    outlets: menu.outlets,
    orderTypes,
  })

  return (
    <WelcomeBuilderEditor
      tenantId={tenant.id}
      tenantSlug={tenantSlug}
      storeName={tenant.name}
      logoUrl={tenant.logo_url || null}
      modes={modes}
      initialDesign={initialDesign}
      initialIsLive={hasCustomWelcome(tenant)}
      brandStyle={brandStyle}
    />
  )
}
