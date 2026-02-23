import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getBundlesByTenant } from '@/lib/bundles-service'
import { BundlesList } from '@/components/admin/bundles-list'
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
}: {
    tenantSlug: string
    tenantId: string
}) {
    const bundles = await getBundlesByTenant(tenantId)

    return (
        <BundlesList
            bundles={bundles}
            tenantSlug={tenantSlug}
            tenantId={tenantId}
        />
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
                <BundlesContent tenantSlug={tenantSlug} tenantId={tenant.id} />
            </Suspense>
        </div>
    )
}
