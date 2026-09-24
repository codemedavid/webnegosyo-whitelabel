import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getOrderStampStatus } from '@/lib/loyalty/order-stamp-service'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { getTenantBranding } from '@/lib/branding-utils'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { describeLoyaltyOffer, type LoyaltyOffer } from '@/lib/loyalty/offer'
import { readLoyaltyTenantFlags } from '@/lib/loyalty/tenant-flags'
import type { Tenant } from '@/types/database'
import { OrderTrackingClient, type OrderTrackingBrand } from './order-tracking-client'
import { OrderTrackingFallback } from './order-tracking-fallback'

export const dynamic = 'force-dynamic' // Always fetch fresh status

interface PageProps {
  params: Promise<{ tenant: string; orderId: string }>
  searchParams: Promise<{ t?: string }>
}

/**
 * The store's live loyalty offer, for the stamp card. Null whenever earning is
 * off, in shadow, or the programs cannot be read — the tracking page must never
 * fail, and must never promise a stamp the ledger will not issue.
 */
async function resolveLoyaltyOffer(tenant: Tenant): Promise<LoyaltyOffer | null> {
  const flags = readLoyaltyTenantFlags(tenant)
  if (!flags.isEnabled || flags.isShadow) return null

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { loadActiveLoyaltyPrograms } = await import('@/lib/loyalty/store')
    const programs = await loadActiveLoyaltyPrograms(createAdminClient(), tenant.id)
    return describeLoyaltyOffer(flags, programs)
  } catch (err) {
    console.error('[Order Tracking] Loyalty offer unavailable:', err instanceof Error ? err.message : err)
    return null
  }
}

async function resolveBrand(tenant: Tenant): Promise<OrderTrackingBrand> {
  const branding = getTenantBranding(tenant as unknown as Record<string, unknown>)
  return {
    storeName: tenant.name,
    logoUrl: branding.logoUrl,
    theme: buildTrackingTheme(branding),
    loyaltyOffer: await resolveLoyaltyOffer(tenant),
  }
}

export default async function OrderTrackingPage({ params, searchParams }: PageProps) {
  const [{ tenant: tenantSlug, orderId }, { t: trackingToken }] = await Promise.all([params, searchParams])

  // Resolve tenant server-side
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  // The brand (loyalty offer), the order and the stamp card are independent
  // reads: run them side by side instead of one after another. The stamp read
  // needs only the offer, so it chains off the brand, not off the order.
  const brandPromise = resolveBrand(tenant)
  const [brand, tracking, stamps] = await Promise.all([
    brandPromise,
    // If tracking token is in URL, fetch initial data server-side (SSR)
    trackingToken ? fetchOrderTrackingData(orderId, trackingToken, tenant.id) : null,
    trackingToken
      ? brandPromise.then((resolved) =>
          resolved.loyaltyOffer
            ? getOrderStampStatus({ orderId, tenantId: tenant.id, token: trackingToken })
            : null
        )
      : null,
  ])

  if (trackingToken && tracking?.data) {
    return (
      <OrderTrackingClient
        orderId={orderId}
        tenantSlug={tenantSlug}
        tenantId={tenant.id}
        trackingToken={trackingToken}
        initialData={tracking.data}
        initialStamps={stamps?.ok ? stamps.status : null}
        brand={brand}
      />
    )
  }

  // No token in URL or fetch failed — fall back to client-side localStorage lookup
  return (
    <OrderTrackingFallback
      orderId={orderId}
      tenantSlug={tenantSlug}
      tenantId={tenant.id}
      brand={brand}
    />
  )
}
