import { getMenuData } from './menu-server'
import { MenuClient } from './menu-client'

// Caching lives in the data layer, not the route: the public menu is served
// from the storefront cache (src/lib/storefront) for STOREFRONT_REVALIDATE_SECONDS,
// while the page itself renders per request for the one per-visitor fact it
// shows (the admin edit shortcut). A route-level `revalidate` here would be
// inert — reading cookies opts the route into dynamic rendering — which is
// exactly how the previous "ISR" left every page view hitting the database.

export default async function MenuPage({
  params
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const data = await getMenuData(tenantSlug)
  const { tenant, categories, menuItems, bundles, outlets, outletsFailed, menuOverrides, overridesFailed, isBrandAdmin, error } = data

  return (
    <MenuClient
      tenant={tenant}
      categories={categories}
      allMenuItems={menuItems}
      bundles={bundles}
      outlets={outlets}
      outletsFailed={outletsFailed}
      menuOverrides={menuOverrides}
      overridesFailed={overridesFailed}
      tenantSlug={tenantSlug}
      isBrandAdmin={isBrandAdmin}
      status={data.status}
      error={error}
    />
  )
}
