import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getMenuItemsByTenant } from '@/lib/admin-service'
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

    const menuItems = await getMenuItemsByTenant(tenant.id)

    return (
        <div className="space-y-6">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Bundles', href: `/${tenantSlug}/admin/bundles` },
                    { label: bundle.name },
                ]}
            />

            <div>
                <h1 className="text-3xl font-bold">Edit Bundle</h1>
                <p className="text-muted-foreground">
                    Update bundle details and items
                </p>
            </div>

            <BundleForm
                bundle={bundle}
                tenantId={tenant.id}
                tenantSlug={tenantSlug}
                menuItems={menuItems}
            />
        </div>
    )
}
