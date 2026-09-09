import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getOrderTypeWithFormFields } from '@/lib/order-types-service'
import { listOrderTypeItemPrices, listPricingMenuItems } from '@/lib/order-type-pricing-service'
import { OrderTypeDetail } from '@/components/admin/order-type-detail'
import { notFound } from 'next/navigation'

export default async function OrderTypeDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>
}) {
  const { tenant: tenantSlug, id: orderTypeId } = await params
  
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    notFound()
  }

  const [orderTypeWithFields, initialPrices, menuItems] = await Promise.all([
    getOrderTypeWithFormFields(orderTypeId, tenant.id),
    listOrderTypeItemPrices(tenant.id, orderTypeId),
    listPricingMenuItems(tenant.id),
  ])

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
        menuItems={menuItems}
        initialPrices={initialPrices}
      />
    </div>
  )
}
