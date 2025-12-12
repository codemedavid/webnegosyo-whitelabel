import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { getOrderTypesByTenant } from '@/lib/order-types-service'
import { OrderTypeCreate } from '@/components/admin/order-type-create'
import type { Tenant } from '@/types/database'
import { notFound } from 'next/navigation'

export default async function NewOrderTypePage({
    params,
}: {
    params: Promise<{ tenant: string }>
}) {
    const { tenant: tenantSlug } = await params

    const tenantData = await getTenantBySlug(tenantSlug)

    if (!tenantData) {
        notFound()
    }

    const tenant: Tenant = tenantData

    // Get existing order types to determine which types are already used
    const existingOrderTypes = await getOrderTypesByTenant(tenant.id)
    const usedTypes = existingOrderTypes.map(ot => ot.type)

    return (
        <div className="space-y-6">
            <Breadcrumbs
                items={[
                    { label: 'Dashboard', href: `/${tenantSlug}/admin` },
                    { label: 'Order Types', href: `/${tenantSlug}/admin/order-types` },
                    { label: 'New Order Type' },
                ]}
            />

            <OrderTypeCreate
                tenantSlug={tenantSlug}
                tenantId={tenant.id}
                usedTypes={usedTypes}
                existingOrderTypesCount={existingOrderTypes.length}
            />
        </div>
    )
}
