import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getBundlesByTenant } from '@/lib/bundles-service'
import { getMenuItemsByTenant } from '@/lib/admin-service'
import { BundlesList } from '@/components/admin/bundles-list'
import { BundleSuggestions } from '@/components/admin/bundle-suggestions'
import type { Tenant } from '@/types/database'

function BundlesSkeleton() {
    return (
        <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                <div
                    key={i}
                    className="h-24 rounded-lg border bg-muted/40 animate-pulse"
                />
            ))}
        </div>
    )
}

async function BundlesContent({
    tenantSlug,
    tenantId,
    menuEngineeringEnabled,
}: {
    tenantSlug: string
    tenantId: string
    menuEngineeringEnabled: boolean
}) {
    const [bundles, menuItems] = await Promise.all([
        getBundlesByTenant(tenantId),
        getMenuItemsByTenant(tenantId),
    ])

    const existingBundleItemIds = bundles.flatMap(
        (b) => b.items?.map((i) => i.menu_item_id) || []
    )

    return (
        <div className="space-y-6">
            {menuEngineeringEnabled && menuItems.length > 0 && (
                <BundleSuggestions
                    menuItems={menuItems}
                    tenantSlug={tenantSlug}
                    existingBundleItemIds={existingBundleItemIds}
                />
            )}
            <BundlesList
                bundles={bundles}
                tenantSlug={tenantSlug}
                tenantId={tenantId}
            />
        </div>
    )
}

export default async function AdminBundlesPage({
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

    if (!tenant.bundles_enabled) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Bundles Not Enabled</h1>
                    <p className="text-muted-foreground mt-2">
                        Contact your superadmin to enable the bundles feature.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Bundles' },
                ]}
            />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Bundles</h1>
                    <p className="text-muted-foreground">
                        Create menu item bundles with special pricing
                    </p>
                </div>
                <Link href={`/${tenantSlug}/admin/bundles/new`}>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Bundle
                    </Button>
                </Link>
            </div>

            <Suspense fallback={<BundlesSkeleton />}>
                <BundlesContent
                    tenantSlug={tenantSlug}
                    tenantId={tenant.id}
                    menuEngineeringEnabled={!!tenant.menu_engineering_enabled}
                />
            </Suspense>
        </div>
    )
}
