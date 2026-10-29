import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { listMenuItemPriceRefs, type AdminMenuListClient } from '@/lib/queries/admin-menu-list'
import { getAddonLibrary } from '@/lib/addon-library-service'
import { getModifierGroupLibrary } from '@/lib/modifier-library-service'
import { readDishDirectory } from '@/lib/addon-groups/read-dish-directory'
import { AddonGroupsWorkspace } from '@/components/admin/addon-groups/addon-groups-workspace'
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

  const supabase = await createClient()
  const [groups, singleAddons, sourceItems, dishes] = await Promise.all([
    getModifierGroupLibrary(tenant.id),
    getAddonLibrary(tenant.id),
    // Names and prices only: dishes as price sources for an add-on.
    listMenuItemPriceRefs(supabase as unknown as AdminMenuListClient, tenant.id),
    // Every dish with the groups it already has, for "Insert into dishes".
    readDishDirectory(supabase, tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Add-ons' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Add-ons</h1>
        <p className="text-muted-foreground">
          Save add-on groups once and insert them into many dishes at a time. Each dish gets its own copy, so you
          can still change one dish without touching the rest.
        </p>
      </div>

      <AddonGroupsWorkspace
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialGroups={groups}
        singleAddons={singleAddons}
        dishes={dishes}
        menuItems={sourceItems}
      />
    </div>
  )
}
