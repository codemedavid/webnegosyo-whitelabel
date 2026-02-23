import { getMenuData } from './menu-server'
import { MenuClient } from './menu-client'

export const revalidate = 300 // ISR: revalidate every 5 minutes

export default async function MenuPage({
  params
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const data = await getMenuData(tenantSlug)
  const { tenant, categories, menuItems, bundles, error } = data

  return (
    <MenuClient
      tenant={tenant}
      categories={categories}
      allMenuItems={menuItems}
      bundles={bundles}
      tenantSlug={tenantSlug}
      error={error}
    />
  )
}

