import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getOrderStampStatus } from '@/lib/loyalty/order-stamp-service'
import { fetchOrderTrackingData } from '@/lib/order-tracking-service'
import { primeTrackingBackendHint } from '@/lib/order-tracking-backend-hint'
import { getTenantBranding } from '@/lib/branding-utils'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { describeLoyaltyOffer, type LoyaltyOffer } from '@/lib/loyalty/offer'
import { readLoyaltyTenantFlags } from '@/lib/loyalty/tenant-flags'
import { readWalletAvailability } from '@/lib/loyalty/wallet-pass/config'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
import type { Tenant } from '@/types/database'
import { OrderTrackingClient, type OrderTrackingBrand } from './order-tracking-client'
import { OrderTrackingFallback } from './order-tracking-fallback'
import { TrackingStudioPreview } from './tracking-studio-preview'
import { STUDIO_PREVIEW_PARAM, TRACKING_PREVIEW_ORDER_ID, previewItemsFrom } from '@/lib/branding-studio/tracking-preview'
import { pickStorefrontColumns } from '@/lib/queries/tenant-storefront-select'
import { getCachedMenuItemsList } from '@/lib/cache'

export const dynamic = 'force-dynamic' // Always fetch fresh status

interface PageProps {
  params: Promise<{ tenant: string; orderId: string }>
  searchParams: Promise<{ t?: string; [STUDIO_PREVIEW_PARAM]?: string }>
}

/**
 * The Branding Studio's sample order page. Only inside the Studio preview
 * (the param), and only sample data: no order is read, so nothing private can
 * show. The store's dishes name the sample lines when the menu can be read.
 */
async function renderStudioPreview(tenant: Tenant, tenantSlug: string) {
  const menu = await getCachedMenuItemsList(tenant.id).catch(() => [])
  return (
    <TrackingStudioPreview
      tenant={pickStorefrontColumns(tenant as unknown as Record<string, unknown>)}
      tenantSlug={tenantSlug}
      tenantId={tenant.id}
      storeName={tenant.name}
      loyaltyOffer={await resolveLoyaltyOffer(tenant)}
      items={previewItemsFrom(menu)}
    />
  )
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
  const row = tenant as unknown as Record<string, unknown>
  const branding = getTenantBranding(row)
  const trackingStyle = readTrackingStyle(row)
  return {
    storeName: tenant.name,
    logoUrl: branding.logoUrl,
    theme: buildTrackingTheme(branding, trackingStyle),
    options: trackingStyle.options,
    storefrontLabels: row.storefront_labels ?? null,
    loyaltyOffer: await resolveLoyaltyOffer(tenant),
  }
}

export default async function OrderTrackingPage({ params, searchParams }: PageProps) {
  const [{ tenant: tenantSlug, orderId }, query] = await Promise.all([params, searchParams])
  const trackingToken = query.t

  // Resolve tenant server-side
  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) notFound()

  if (orderId === TRACKING_PREVIEW_ORDER_ID) {
    if (query[STUDIO_PREVIEW_PARAM] !== '1') notFound()
    return renderStudioPreview(tenant, tenantSlug)
  }

  // The first tracking paint follows checkout's redirect, often on a runtime
  // that has never routed this store. The cached row predicts the backend so
  // the order read can leave with the routing read; the routing read still
  // decides (see order-tracking-backend-hint.ts).
  primeTrackingBackendHint(tenant.id, tenant)

  // The brand (loyalty offer), the order and the stamp card are independent
  // reads: run them side by side instead of one after another. The stamp read
  // needs only the offer, so it chains off the brand, not off the order.
  const brandPromise = resolveBrand(tenant)
  const [brand, tracking, stamps] = await Promise.all([
    brandPromise,
    // If tracking token is in URL, fetch initial data server-side (SSR)
    trackingToken ? fetchOrderTrackingData(orderId, trackingToken, tenant.id) : null,
    trackingToken && readLoyaltyTenantFlags(tenant).isEnabled
      ? getOrderStampStatus({ orderId, tenantId: tenant.id, token: trackingToken })
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
        initialStamps={stamps?.ok
          // Same shape as /api/orders/stamps, so the wallet buttons are there on first paint.
          ? { ...stamps.status, wallets: readWalletAvailability() }
          : null}
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
