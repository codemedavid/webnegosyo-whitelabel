import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { createClient } from '@/lib/supabase/server'
import { getTenantSecrets } from '@/lib/tenant-secrets'
import { getPaymentMethodsAction } from '@/app/actions/payment-methods'
import type { OrderType } from '@/types/database'
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

/**
 * Every enabled order type, not just the web-facing ones: the merchant links
 * methods to register-only channels (Grab, Foodpanda) from here too. Same
 * projection the browser used to read after the page had already loaded.
 */
async function readLinkableOrderTypes(tenantId: string): Promise<OrderType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('order_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('order_index', { ascending: true })

  if (error) throw error
  return data as unknown as OrderType[]
}

/**
 * Read on the server, in one parallel batch, and handed to the client as props.
 * The page used to render an empty shell whose effect then fetched the methods
 * (a server action) and only after that the order types (from the browser) —
 * two round trips after the page had already loaded, repeated after every edit.
 * Every write here goes through an action that revalidates this page, so the
 * fresh read arrives with the action's own response.
 */
async function PaymentMethodsContent({
  tenantId,
  tenantSlug,
  isLoyverseEnabled,
}: {
  tenantId: string
  tenantSlug: string
  isLoyverseEnabled: boolean
}) {
  const [methodsResult, orderTypesResult, isLoyverseConnected] = await Promise.all([
    getPaymentMethodsAction(tenantId),
    readLinkableOrderTypes(tenantId).then(
      (orderTypes) => ({ orderTypes, error: null }),
      (error: unknown) => ({
        orderTypes: [] as OrderType[],
        error: error instanceof Error ? error.message : 'Failed to load order types',
      })
    ),
    isLoyverseEnabled ? hasLoyverseToken(tenantId) : Promise.resolve(false),
  ])

  const loadError = !methodsResult.success
    ? methodsResult.error ?? 'Failed to load payment methods'
    : orderTypesResult.error

  if (loadError) {
    console.error('[payment-methods] load failed:', loadError)
  }

  return (
    <PaymentMethodsManagement
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      isLoyverseConnected={isLoyverseConnected}
      paymentMethods={methodsResult.data ?? []}
      orderTypes={orderTypesResult.orderTypes}
      loadError={loadError}
    />
  )
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
        <PaymentMethodsContent
          tenantId={tenant.id}
          tenantSlug={tenantSlug}
          isLoyverseEnabled={Boolean(tenant.loyverse_enabled)}
        />
      </Suspense>
    </div>
  )
}
