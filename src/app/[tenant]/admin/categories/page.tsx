import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug, getCategoriesByTenant } from '@/lib/admin-service'
import { CategoriesList } from '@/components/admin/categories-list'
import type { Tenant } from '@/types/database'

export default async function CategoriesPage({
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

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Categories' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Categories</h1>
          <p className="text-muted-foreground">Organize your menu with categories</p>
        </div>
      </div>

      <CategoriesList
        categories={categories}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}
