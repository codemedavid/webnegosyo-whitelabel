import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getMenuItemsByTenant } from '@/lib/admin-service'
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

    // Fetch menu items for the bundle item picker
    const menuItems = await getMenuItemsByTenant(tenant.id)

    const resolvedSearchParams = await searchParams
    const suggestedItemIds = resolvedSearchParams.suggestItems?.split(',') || []
    const suggestedDiscount = resolvedSearchParams.suggestDiscount
        ? parseInt(resolvedSearchParams.suggestDiscount)
        : undefined

    return (
        <div className="space-y-6">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Bundles', href: `/${tenantSlug}/admin/bundles` },
                    { label: 'New Bundle' },
                ]}
            />

            <div>
                <h1 className="text-3xl font-bold">Create Bundle</h1>
                <p className="text-muted-foreground">
                    Group menu items together with special pricing
                </p>
            </div>

            <BundleForm
                tenantId={tenant.id}
                tenantSlug={tenantSlug}
                menuItems={menuItems}
                suggestedItemIds={suggestedItemIds}
                suggestedDiscount={suggestedDiscount}
            />
        </div>
    )
}
