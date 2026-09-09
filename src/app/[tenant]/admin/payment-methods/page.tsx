import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { PaymentMethodsManagement } from './payment-methods-management'

interface PaymentMethodsPageProps {
  params: Promise<{ tenant: string }>
}

/** Only the boolean reaches the client; the token itself stays server-side. */
async function hasLoyverseToken(tenantId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const secrets = await getTenantSecrets(supabase, tenantId)
    return Boolean(secrets?.loyverse_access_token)
  } catch (error) {
    console.error('[payment-methods] could not read Loyverse token:', error instanceof Error ? error.message : error)
    return false
  }
}

export default async function PaymentMethodsPage({ params }: PaymentMethodsPageProps) {
  const { tenant: tenantSlug } = await params
  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  const isLoyverseConnected = tenant.loyverse_enabled
    ? await hasLoyverseToken(tenant.id)
    : false

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
        <PaymentMethodsManagement
          tenantId={tenant.id}
          tenantSlug={tenantSlug}
          isLoyverseConnected={isLoyverseConnected}
        />
      </Suspense>
    </div>
  )
}
