import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { listVouchersAction } from '@/app/actions/voucher-admin'
import { VouchersManagement } from './vouchers-management'

interface VouchersPageProps {
  params: Promise<{ tenant: string }>
}

/**
 * The list is read here, on the server, and handed down as props. It used to be
 * fetched by the client after the page loaded (and this Suspense guarded
 * nothing, its child being a client component). Saves and retirements are
 * actions that revalidate this page, so the fresh list rides back on their
 * response.
 */
async function VouchersContent({ tenantId }: { tenantId: string }) {
  const result = await listVouchersAction(tenantId)
  return (
    <VouchersManagement
      tenantId={tenantId}
      vouchers={result.data ?? []}
      loadError={result.success ? null : result.error ?? 'Could not load vouchers'}
    />
  )
}

export default async function VouchersPage({ params }: VouchersPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Vouchers</h1>
        <p className="text-gray-600 mt-2">
          Discount codes for checkout and the counter. Retiring a code stops it being
          accepted without erasing the orders that already used it.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        }
      >
        <VouchersContent tenantId={tenant.id} />
      </Suspense>
    </div>
  )
}
