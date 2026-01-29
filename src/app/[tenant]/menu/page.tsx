import { getMenuData } from './menu-server'
import { MenuClient } from './menu-client'

export const dynamic = 'force-static'
export const revalidate = 300

export default async function MenuPage({
  params
}: {
  params: { tenant: string }
}) {
  const tenantSlug = params.tenant

  const data = await getMenuData(tenantSlug)
  const { tenant, categories, menuItems, error } = data

  return (
    <MenuClient
      tenant={tenant}
      categories={categories}
      allMenuItems={menuItems}
      tenantSlug={tenantSlug}
      error={error}
    />
  )
}
