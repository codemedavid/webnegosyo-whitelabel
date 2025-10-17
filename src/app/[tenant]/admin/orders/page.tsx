import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { getOrdersByTenant } from '@/lib/orders-service'
import { OrdersList } from '@/components/admin/orders-list'
import type { Tenant } from '@/types/database'

export default async function OrdersPage({
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

  const orders = await getOrdersByTenant(tenant.id).catch(() => [])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Orders' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">Manage customer orders</p>
      </div>

      <OrdersList
        orders={orders}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
      />
    </div>
  )
}

