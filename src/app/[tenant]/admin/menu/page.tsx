import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemsByTenant } from '@/lib/admin-service'
import { MenuItemsList } from '@/components/admin/menu-items-list'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { createSupabaseOutletMenuRepository } from '@/lib/outlets/supabase-outlet-menu-repository'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { MenuSkeleton } from '@/components/admin/menu-skeleton'
import type { Tenant } from '@/types/database'

async function MenuContent({
  tenantSlug,
  tenantId,
  isMultiBranch,
}: {
  tenantSlug: string
  tenantId: string
  isMultiBranch: boolean
}) {
  // Branch data is only read for a store that has branches; every other store
  // runs exactly the queries it ran before per-branch menus existed.
  const [menuItems, categories, outlets, menuOverrides] = await Promise.all([
    getMenuItemsByTenant(tenantId),
    getCachedCategoriesByTenant(tenantId),
    isMultiBranch ? createSupabaseOutletRepository().listByTenant(tenantId) : Promise.resolve([]),
    isMultiBranch
      ? createSupabaseOutletMenuRepository().listByTenant(tenantId)
      : Promise.resolve([]),
  ])

  return (
    <MenuItemsList
      items={menuItems}
      categories={categories}
      tenantSlug={tenantSlug}
      tenantId={tenantId}
      outlets={outlets.filter((outlet) => outlet.is_active).map((o) => ({ id: o.id, name: o.name }))}
      menuOverrides={menuOverrides}
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

      <Suspense fallback={<MenuSkeleton />}>
        <MenuContent
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          isMultiBranch={isMultiBranchEnabled(tenant)}
        />
      </Suspense>
    </div>
  )
}
