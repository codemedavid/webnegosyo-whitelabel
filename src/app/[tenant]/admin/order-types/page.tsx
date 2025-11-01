import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug } from '@/lib/admin-service'
import { getAllOrderTypesWithFormFields, initializeOrderTypesForTenant } from '@/lib/order-types-service'
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

  // Initialize default order types if they don't exist
  // This ensures new tenants get default order types
  let orderTypes = await getAllOrderTypesWithFormFields(tenant.id)
  
  if (orderTypes.length === 0) {
    // Try to initialize default order types
    try {
      await initializeOrderTypesForTenant(tenant.id)
      // Refresh the order types after initialization
      orderTypes = await getAllOrderTypesWithFormFields(tenant.id)
    } catch (error) {
      console.error('Failed to initialize order types:', error)
      // Continue anyway - the database trigger should handle it
    }
  }

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
