import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { getOrderTypeWithFormFields } from '@/lib/order-types-service'
import { OrderTypeDetail } from '@/components/admin/order-type-detail'
import type { Tenant } from '@/types/database'
import { notFound } from 'next/navigation'

export default async function OrderTypeDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>
}) {
  const { tenant: tenantSlug, id: orderTypeId } = await params
  
  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    notFound()
  }

  const tenant: Tenant = tenantData

  const orderTypeWithFields = await getOrderTypeWithFormFields(orderTypeId, tenant.id)

  if (!orderTypeWithFields) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Order Types', href: `/${tenantSlug}/admin/order-types` },
          { label: orderTypeWithFields.name },
        ]}
      />

      <OrderTypeDetail
        orderType={orderTypeWithFields}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}

