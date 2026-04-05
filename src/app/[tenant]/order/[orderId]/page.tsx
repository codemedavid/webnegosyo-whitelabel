import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { OrderTrackingClient } from './order-tracking-client'
import { OrderTrackingFallback } from './order-tracking-fallback'

export const dynamic = 'force-dynamic' // Always fetch fresh status

interface PageProps {
  params: Promise<{ tenant: string; orderId: string }>
  searchParams: Promise<{ t?: string }>
}

export default async function OrderTrackingPage({ params, searchParams }: PageProps) {
  const { tenant: tenantSlug, orderId } = await params
  const { t: trackingToken } = await searchParams

  // Resolve tenant server-side
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  // If tracking token is in URL, fetch initial data server-side (SSR)
  if (trackingToken) {
    const { data } = await fetchOrderTrackingData(orderId, trackingToken, tenant.id)

    if (data) {
      return (
        <OrderTrackingClient
          orderId={orderId}
          tenantSlug={tenantSlug}
          tenantId={tenant.id}
          trackingToken={trackingToken}
          initialData={data}
        />
      )
    }
  }

  // No token in URL or fetch failed — fall back to client-side localStorage lookup
  return (
    <OrderTrackingFallback
      orderId={orderId}
      tenantSlug={tenantSlug}
      tenantId={tenant.id}
    />
  )
}
