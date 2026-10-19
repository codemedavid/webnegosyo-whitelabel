'use client'

/**
 * The customer's stamp card, shown at checkout beside the number they typed.
 *
 * Composed into `CheckoutFields` so every design that uses the shared fields
 * gets it, and into Classic by hand for the same reason Classic hand-places the
 * consent box — it keeps its original markup.
 *
 * The panel paints from `var(--trk-*)`, which only the tracking page defines on
 * its root, so the store's palette and loyalty look are supplied here: one
 * loyalty card, one look, wherever the customer meets it.
 */

import { useMemo } from 'react'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { TrackingOptionsProvider } from '@/components/customer/order-tracking/tracking-options'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
import { LoyaltyProgressPanel } from '@/components/customer/loyalty-progress-panel'
import { useLoyaltyProgress } from '@/hooks/use-loyalty-progress'
import { resolveCheckoutLoyaltyPhone } from '@/lib/loyalty/checkout-phone'
import { isLoyaltyLive } from '@/lib/loyalty/tenant-flags'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

export function CheckoutLoyaltyProgress({ checkout }: { checkout: UseCheckoutReturn }) {
  const { tenant, branding, formFields, customerData, outlet } = checkout

  const progress = useLoyaltyProgress({
    tenantId: tenant?.id,
    phone: resolveCheckoutLoyaltyPhone({ formFields, customerData }),
    outletId: outlet?.selectedOutletId ?? null,
    // A store that is off, or only shadow-earning, must not be asked at all —
    // the read would be a wasted request whose answer is always "nothing".
    enabled: isLoyaltyLive(tenant),
  })

  // The owner's loyalty look (Branding Studio → Loyalty card); in the Studio
  // preview `tenant` already carries the unpublished draft.
  const trackingStyle = useMemo(() => readTrackingStyle(tenant as unknown as Record<string, unknown> | null), [tenant])

  if (!progress.card && !progress.isLoading && !progress.error) return null

  return (
    <div style={buildTrackingTheme(branding, trackingStyle)}>
      <TrackingOptionsProvider options={trackingStyle.options}>
        <LoyaltyProgressPanel
          offer={progress.offer}
          card={progress.card}
          isLoading={progress.isLoading}
          error={progress.error}
          onRetry={progress.refresh}
          storeName={tenant?.name ?? 'the store'}
          logoUrl={branding.logoUrl}
          tenantSlug={tenant?.slug}
        />
      </TrackingOptionsProvider>
    </div>
  )
}
