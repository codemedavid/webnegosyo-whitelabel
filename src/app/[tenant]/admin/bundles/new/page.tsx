import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getMenuItemsByTenant, getCategoriesByTenant } from '@/lib/admin-service'
import { BundleForm } from '@/components/admin/bundle-form'
import type { Tenant } from '@/types/database'

export default async function NewBundlePage({
    params,
    searchParams,
}: {
    params: Promise<{ tenant: string }>
    searchParams: Promise<{ suggestItems?: string; suggestDiscount?: string }>
}) {
    const { tenant: tenantSlug } = await params

    const tenantData = await getCachedTenantBySlug(tenantSlug)

    if (!tenantData) {
        return <div>Tenant not found</div>
    }

    const tenant: Tenant = tenantData

    // Fetch menu items and categories for the bundle form
    const [menuItems, categories] = await Promise.all([
        getMenuItemsByTenant(tenant.id),
        getCategoriesByTenant(tenant.id),
    ])

    const resolvedSearchParams = await searchParams
    const suggestedItemIds = resolvedSearchParams.suggestItems?.split(',') || []
    const suggestedDiscount = resolvedSearchParams.suggestDiscount
        ? parseInt(resolvedSearchParams.suggestDiscount)
        : undefined

    return (
        <div className="space-y-4">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Bundles', href: `/${tenantSlug}/admin/bundles` },
                    { label: 'New Bundle' },
                ]}
            />

            <BundleForm
                tenantId={tenant.id}
                tenantSlug={tenantSlug}
                menuItems={menuItems}
                categories={categories}
                suggestedItemIds={suggestedItemIds}
                suggestedDiscount={suggestedDiscount}
            />
        </div>
    )
}
