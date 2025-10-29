import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { getAllOrderTypesWithFormFields } from '@/lib/order-types-service'
import { OrderTypesList } from '@/components/admin/order-types-list'
import type { Tenant } from '@/types/database'

export default async function OrderTypesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  const orderTypes = await getAllOrderTypesWithFormFields(tenant.id)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Order Types' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Order Types</h1>
          <p className="text-muted-foreground">Configure dine-in, pickup, and delivery options</p>
        </div>
      </div>

      <OrderTypesList
        orderTypes={orderTypes}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}
