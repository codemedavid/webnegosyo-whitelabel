import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { CategoriesList } from '@/components/admin/categories-list'

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const categories = await getCachedCategoriesByTenant(tenant.id)

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
