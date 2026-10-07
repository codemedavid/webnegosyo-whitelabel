import Link from 'next/link'
import { EditorPageHeader } from '@/components/admin/menu-editor/editor-page-header'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { dishCostConvexUrl } from '@/lib/menu-editor/cost-backend'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getLinkableMenuItems } from '@/lib/admin-service'

export default async function NewMenuItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ category?: string | string[] }>
}) {
  const { tenant: tenantSlug } = await params
  const { category } = await searchParams

  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const isModifierGroupsTenant = tenant.modifier_groups_enabled ?? false
  const [categories, linkableItems] = await Promise.all([
    getCachedCategoriesByTenant(tenant.id),
    // Only the modifier-groups editor reads these, and the query scans every
    // dish the tenant has — skipped for every other store, as on the edit page.
    isModifierGroupsTenant ? getLinkableMenuItems(tenant.id).catch(() => []) : Promise.resolve([]),
  ])

  const menuHref = `/${tenantSlug}/admin/menu`

  if (categories.length === 0) {
    return (
      <div className="space-y-5">
        <EditorPageHeader backHref={menuHref} title="Add a dish" />
        <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-10 text-center">
          <h2 className="text-lg font-semibold">First, make a category</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every dish goes under a category, like Rice Meals or Drinks. Make one, then come back here.
          </p>
          <Link
            href={`/${tenantSlug}/admin/categories`}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Make a category
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <EditorPageHeader backHref={menuHref} title="Add a dish" />

      <MenuItemForm
        categories={categories}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        menuEngineeringEnabled={tenant.menu_engineering_enabled}
        modifierGroupsEnabled={isModifierGroupsTenant}
        linkableItems={linkableItems}
        inventoryEnabled={tenant.inventory_enabled ?? false}
        presellEnabled={tenant.presell_enabled ?? false}
        convexUrl={dishCostConvexUrl(tenant)}
        defaultCategoryId={typeof category === 'string' ? category : undefined}
      />
    </div>
  )
}
