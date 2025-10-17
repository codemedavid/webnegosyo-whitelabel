import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug, getMenuItemsByTenant, getCategoriesByTenant } from '@/lib/admin-service'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import type { Tenant } from '@/types/database'

export default async function AdminMenuPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  const [menuItems, categories] = await Promise.all([
    getMenuItemsByTenant(tenant.id),
    getCategoriesByTenant(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Menu Management' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Menu Management</h1>
          <p className="text-muted-foreground">Manage your restaurant menu items</p>
        </div>
        <Link href={`/${tenantSlug}/admin/menu/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </Link>
      </div>

      <MenuItemsList
        items={menuItems}
        categories={categories}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}
