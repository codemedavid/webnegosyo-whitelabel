import Link from 'next/link'
import { EditorPageHeader } from '@/components/admin/menu-editor/editor-page-header'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemById, getLinkableMenuItems } from '@/lib/admin-service'
import { ItemBranchesPanel } from '@/components/admin/item-branches-panel'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getPresellAllocations } from '@/lib/presell/allocations-read'
import { toBusinessDayKey } from '@/lib/inventory/business-day'
import { getLinkedMenuItemIds } from '@/lib/inventory/recipe-link-read'

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
  const isInventoryTenant = tenant.inventory_enabled ?? false

  const [item, categories, linkableItems, outlets, itemOverrides, presellRead, recipeLinks] = await Promise.all([
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
    // Only so the Ingredients row can say "Linked" or "Not linked" while
    // closed; a failed read (null) leaves the row without a verdict.
    isInventoryTenant ? getLinkedMenuItemIds(tenant.id) : Promise.resolve({ linkedMenuItemIds: null }),
  ])

  const presellAllocations =
    presellRead?.status === 'fulfilled' ? presellRead.value : undefined
  const presellLoadError =
    presellRead?.status === 'rejected' ? "Could not load this dish's pre-order dates." : undefined

  const menuHref = `/${tenantSlug}/admin/menu`

  if (!item) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-bold">This dish isn&apos;t on your menu</h1>
        <p className="mt-2 text-muted-foreground">It may have been deleted.</p>
        <Link href={menuHref} className="mt-4 inline-block font-medium text-primary hover:underline">
          Back to menu
        </Link>
      </div>
    )
  }

  const hasRecipe = recipeLinks.linkedMenuItemIds === null
    ? undefined
    : recipeLinks.linkedMenuItemIds.includes(item.id)

  return (
    <div className="space-y-5">
      <EditorPageHeader
        backHref={menuHref}
        title={item.name}
        status={item.is_available ? undefined : 'Out of stock'}
      />

      <MenuItemForm
        item={item}
        categories={categories}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        menuEngineeringEnabled={tenant.menu_engineering_enabled}
        modifierGroupsEnabled={isModifierGroupsTenant}
        linkableItems={linkableItems}
        inventoryEnabled={isInventoryTenant}
        hasRecipe={hasRecipe}
        presellEnabled={isPresellTenant}
        presellAllocations={presellAllocations}
        presellLoadError={presellLoadError}
        convexUrl={tenant.convex_deployment_url ?? undefined}
        branchesPanel={
          /*
            A row of "More options" but outside the <form>: a branch override
            is a separate row with its own permissions and saves on its own,
            and a branch manager editing what their shop has run out of should
            not be made to submit the whole dish.
          */
          <ItemBranchesPanel
            tenantId={tenant.id}
            tenantSlug={tenantSlug}
            item={item}
            outlets={outlets
              .filter((outlet) => outlet.is_active)
              .map((outlet) => ({ id: outlet.id, name: outlet.name }))}
            initialOverrides={itemOverrides}
          />
        }
      />
    </div>
  )
}
