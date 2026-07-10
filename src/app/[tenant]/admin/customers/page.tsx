import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getCustomersByTenant } from '@/lib/customers-service'
import { CustomersList } from '@/components/admin/customers-list'
import { CustomersSkeleton } from '@/components/admin/customers-skeleton'
import type { Tenant } from '@/types/database'

interface CustomersPageProps {
  params: Promise<{ tenant: string }>
}

// Load the tenant's most-recently-active customers. Search and re-sort happen
// client-side over this loaded page in CustomersList; server-side sort and
// pagination via getCustomersByTenant's params remain a follow-up.
const CUSTOMERS_PAGE_SIZE = 100

async function CustomersContent({
  tenantId,
  tenantSlug,
}: {
  tenantId: string
  tenantSlug: string
}) {
  const customers = await getCustomersByTenant(tenantId, {
    sort: 'recent',
    limit: CUSTOMERS_PAGE_SIZE,
  }).catch(() => [])

  return <CustomersList customers={customers} tenantSlug={tenantSlug} />
}

export default async function CustomersPage({ params }: CustomersPageProps) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Customers' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">
          Your regulars, captured automatically from orders.
        </p>
      </div>

      <Suspense fallback={<CustomersSkeleton />}>
        <CustomersContent tenantId={tenant.id} tenantSlug={tenantSlug} />
      </Suspense>
    </div>
  )
}
