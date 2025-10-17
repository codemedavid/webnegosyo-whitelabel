import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { getTenantBySlug, getCategoriesByTenant } from '@/lib/admin-service'
import type { Tenant } from '@/types/database'

export default async function NewMenuItemPage({
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

  const categories = await getCategoriesByTenant(tenant.id)

  if (categories.length === 0) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: `/${tenantSlug}/admin` },
            { label: 'Menu Management', href: `/${tenantSlug}/admin/menu` },
            { label: 'New Item' },
          ]}
        />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">No categories found</h2>
          <p className="text-muted-foreground mb-4">
            You need to create at least one category before adding menu items.
          </p>
          <a
            href={`/${tenantSlug}/admin/categories`}
            className="text-primary hover:underline"
          >
            Go to Categories
          </a>
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
          { label: 'New Item' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Add Menu Item</h1>
        <p className="text-muted-foreground">Create a new item for your menu</p>
      </div>

      <MenuItemForm
        categories={categories}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
      />
    </div>
  )
}
