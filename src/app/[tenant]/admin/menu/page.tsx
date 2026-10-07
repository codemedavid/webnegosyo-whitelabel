import { Suspense } from 'react'
import Link from 'next/link'
import { FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { listAdminMenuItems, type AdminMenuListClient } from '@/lib/queries/admin-menu-list'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getLinkedMenuItemIds } from '@/lib/inventory/recipe-link-read'
import { MenuSkeleton } from '@/components/admin/menu-skeleton'
import type { Tenant } from '@/types/database'

async function MenuContent({
  tenantSlug,
  tenantId,
  isMultiBranch,
  inventoryEnabled,
}: {
  tenantSlug: string
  tenantId: string
  isMultiBranch: boolean
  inventoryEnabled: boolean
}) {
  // Branch data is only read for a store that has branches; every other store
  // runs exactly the queries it ran before per-branch menus existed. The same
  // rule for recipes: only an inventory tenant pays for the link read.
  //
  // The list read is the lean projection (admin-menu-list.ts): the page shows a
  // photo, a name, a price and badges, so the variation/add-on/modifier JSON of
  // every dish is not read, let alone serialized to the browser.
  const supabase = await createClient()
  const [menuItems, categories, outlets, menuOverrides, recipeLinks] = await Promise.all([
    listAdminMenuItems(supabase as unknown as AdminMenuListClient, tenantId),
    getCachedCategoriesByTenant(tenantId),
    isMultiBranch ? createSupabaseOutletRepository().listByTenant(tenantId) : Promise.resolve([]),
    isMultiBranch
      ? createSupabaseOutletMenuRepository().listByTenant(tenantId)
      : Promise.resolve([]),
    inventoryEnabled
      ? getLinkedMenuItemIds(tenantId)
      : Promise.resolve({ linkedMenuItemIds: null }),
  ])

  return (
    <MenuItemsList
      items={menuItems}
      categories={categories}
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      outlets={outlets.filter((outlet) => outlet.is_active).map((o) => ({ id: o.id, name: o.name }))}
      menuOverrides={menuOverrides}
      inventoryEnabled={inventoryEnabled}
      recipeLinkedItemIds={recipeLinks.linkedMenuItemIds}
    />
  )
}

export default async function AdminMenuPage({
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

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground">Tap a dish to edit it. Use the switch when something runs out.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/${tenantSlug}/admin/categories`}>
            <Button variant="outline" className="h-11 max-sm:w-11 max-sm:px-0" aria-label="Categories">
              <FolderOpen className="h-4 w-4 sm:mr-2" />
              <span className="max-sm:sr-only">Categories</span>
            </Button>
          </Link>
          <Link href={`/${tenantSlug}/admin/menu/new`}>
            <Button className="h-11 px-5">
              <Plus className="mr-1.5 h-4 w-4" />
              Add dish
            </Button>
          </Link>
        </div>
      </div>

      <Suspense fallback={<MenuSkeleton />}>
        <MenuContent
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          isMultiBranch={isMultiBranchEnabled(tenant)}
          inventoryEnabled={Boolean(tenant.inventory_enabled)}
        />
      </Suspense>
    </div>
  )
}
