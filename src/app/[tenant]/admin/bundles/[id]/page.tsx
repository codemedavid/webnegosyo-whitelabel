import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getMenuItemsByTenant, getCategoriesByTenant } from '@/lib/admin-service'
import { getBundleById } from '@/lib/bundles-service'
import { BundleForm } from '@/components/admin/bundle-form'
import type { Tenant } from '@/types/database'

export default async function EditBundlePage({
    params,
}: {
    params: Promise<{ tenant: string; id: string }>
}) {
    const { tenant: tenantSlug, id: bundleId } = await params

    const tenantData = await getCachedTenantBySlug(tenantSlug)

    if (!tenantData) {
        return <div>Tenant not found</div>
    }

    const tenant: Tenant = tenantData

    let bundle
    try {
        bundle = await getBundleById(bundleId, tenant.id)
    } catch {
        notFound()
    }

    const [menuItems, categories] = await Promise.all([
        getMenuItemsByTenant(tenant.id),
        getCategoriesByTenant(tenant.id),
    ])

    return (
        <div className="space-y-4">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Bundles', href: `/${tenantSlug}/admin/bundles` },
                    { label: bundle.name },
                ]}
            />

            <BundleForm
                bundle={bundle}
                tenantId={tenant.id}
                tenantSlug={tenantSlug}
                menuItems={menuItems}
                categories={categories}
            />
        </div>
    )
}
