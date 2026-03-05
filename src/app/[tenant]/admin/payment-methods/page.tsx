import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { PaymentMethodsManagement } from './payment-methods-management'

interface PaymentMethodsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function PaymentMethodsPage({ params }: PaymentMethodsPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment Methods</h1>
        <p className="text-gray-600 mt-2">
          Manage payment methods and their availability for different order types
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        }
      >
        <PaymentMethodsManagement tenantId={tenant.id} tenantSlug={tenantSlug} />
      </Suspense>
    </div>
  )
}
