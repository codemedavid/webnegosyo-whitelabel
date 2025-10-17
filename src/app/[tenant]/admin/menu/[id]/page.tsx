import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { getTenantBySlug, getCategoriesByTenant, getMenuItemById } from '@/lib/admin-service'
import type { Tenant } from '@/types/database'

export default async function EditMenuItemPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>
}) {
  const { tenant: tenantSlug, id: itemId } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  const [item, categories] = await Promise.all([
    getMenuItemById(itemId, tenant.id).catch(() => null),
    getCategoriesByTenant(tenant.id),
  ])

  if (!item) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: `/${tenantSlug}/admin` },
            { label: 'Menu Management', href: `/${tenantSlug}/admin/menu` },
            { label: 'Edit Item' },
          ]}
        />
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Item not found</h1>
          <p className="text-muted-foreground">The menu item you're looking for doesn't exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Menu Management', href: `/${tenantSlug}/admin/menu` },
          { label: 'Edit Item' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Edit Menu Item</h1>
        <p className="text-muted-foreground">Update the details of {item.name}</p>
      </div>

      <MenuItemForm
        item={item}
        categories={categories}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
      />
    </div>
  )
}
