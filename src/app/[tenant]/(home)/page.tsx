import { getMenuData } from '../menu/menu-server'
import { MenuClient } from '../menu/menu-client'

// The tenant root: `/` on a tenant host, `/{slug}` on the platform host. It
// reads the same cached menu data as /menu (so add-to-cart, the product sheet
// and the branch gate all work here) and asks the tenant's storefront pack for
// its home page. A pack without one shows its menu — what `/` always served.
// Like /menu, caching lives in the data layer; the route renders per request.
export default async function HomePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  const data = await getMenuData(tenantSlug)
  const { tenant, categories, menuItems, bundles, outlets, outletsFailed, menuOverrides, overridesFailed, isBrandAdmin, error } = data

  return (
    <MenuClient
      page="home"
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
