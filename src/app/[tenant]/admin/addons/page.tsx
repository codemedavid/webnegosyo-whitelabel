import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getMenuItemsByTenant } from '@/lib/admin-service'
import { getAddonLibrary } from '@/lib/addon-library-service'
import { AddonLibraryManager } from '@/components/admin/addon-library-manager'
import type { Tenant } from '@/types/database'

export default async function AdminAddonsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)
  if (!tenantData) {
    return <div>Tenant not found</div>
  }
  const tenant: Tenant = tenantData

  const [entries, menuItems] = await Promise.all([
    getAddonLibrary(tenant.id),
    getMenuItemsByTenant(tenant.id),
  ])

  const sourceItems = menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    discounted_price: item.discounted_price ?? null,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Add-ons' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Add-on Library</h1>
        <p className="text-muted-foreground">
          Define add-ons once and attach them to any menu item — no more retyping. An add-on can be
          a manual entry or sourced from an existing menu item, each with its own cost.
        </p>
      </div>

      <AddonLibraryManager
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialEntries={entries}
        menuItems={sourceItems}
      />
    </div>
  )
}
