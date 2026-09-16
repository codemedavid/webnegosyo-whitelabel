import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemById, getLinkableMenuItems } from '@/lib/admin-service'
import { ItemBranchesPanel } from '@/components/admin/item-branches-panel'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getPresellAllocations } from '@/lib/presell/allocations-read'
import { toBusinessDayKey } from '@/lib/inventory/business-day'

export default async function EditMenuItemPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>
}) {
  const { tenant: tenantSlug, id: itemId } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const isMultiBranch = isMultiBranchEnabled(tenant)

  // Fetched here rather than by the panel on mount: the panel used to render
  // empty, hydrate, then start its own round trip, so the merchant watched an
  // empty calendar before any dates appeared. This rides along with the
  // queries the page already makes.
  const isPresellTenant = tenant.presell_enabled ?? false
  const isModifierGroupsTenant = tenant.modifier_groups_enabled ?? false

  const [item, categories, linkableItems, outlets, itemOverrides, presellRead] = await Promise.all([
    getMenuItemById(itemId, tenant.id).catch(() => null),
    getCachedCategoriesByTenant(tenant.id),
    // Only the modifier-groups editor reads these, and the query is an
    // unbounded scan of every dish the tenant has. Skipping it when the
    // editor is off spares every other store the whole round trip.
    isModifierGroupsTenant ? getLinkableMenuItems(tenant.id).catch(() => []) : Promise.resolve([]),
    isMultiBranch
      ? createSupabaseOutletRepository().listByTenant(tenant.id).catch(() => [])
      : Promise.resolve([]),
    isMultiBranch
      ? createSupabaseOutletMenuRepository().listByMenuItem(tenant.id, itemId).catch(() => [])
      : Promise.resolve([]),
    // `allSettled`, not `.catch(() => undefined)`: an unreadable panel and a
    // dish with no dates are the same empty array, and the merchant would
    // then save that emptiness over dates that are still on sale.
    isPresellTenant
      ? Promise.allSettled([
          getPresellAllocations(tenant.id, itemId, toBusinessDayKey(new Date().toISOString())),
        ]).then(([outcome]) => outcome)
      : Promise.resolve(null),
  ])

  const presellAllocations =
    presellRead?.status === 'fulfilled' ? presellRead.value : undefined
  const presellLoadError =
    presellRead?.status === 'rejected' ? "Could not load this dish's pre-order dates." : undefined

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
          <p className="text-muted-foreground">The menu item you&apos;re looking for doesn&apos;t exist.</p>
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
        menuEngineeringEnabled={tenant.menu_engineering_enabled}
        modifierGroupsEnabled={isModifierGroupsTenant}
        linkableItems={linkableItems}
        inventoryEnabled={tenant.inventory_enabled ?? false}
        presellEnabled={isPresellTenant}
        presellAllocations={presellAllocations}
        presellLoadError={presellLoadError}
        convexUrl={tenant.convex_deployment_url ?? undefined}
      />

      {/*
        Its own panel below the form rather than a field inside it: a branch
        override is a separate row with its own permissions, and a branch
        manager editing what their shop has run out of should not be made to
        submit the whole dish.
      */}
      <ItemBranchesPanel
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        item={item}
        outlets={outlets
          .filter((outlet) => outlet.is_active)
          .map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        initialOverrides={itemOverrides}
      />
    </div>
  )
}
