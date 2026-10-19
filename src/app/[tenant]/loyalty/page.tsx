import { notFound } from 'next/navigation'
import { getCachedTenantBySlug } from '@/lib/cache'
import { LoyaltyWalletPage } from '@/components/customer/loyalty-wallet-page'
import { getTenantBranding } from '@/lib/branding-utils'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { TrackingOptionsProvider } from '@/components/customer/order-tracking/tracking-options'
import { readTrackingStyle } from '@/lib/tracking-style/keys'
export const metadata = {
  title: 'Your loyalty rewards',
  robots: { index: false, follow: false },
}
export default async function LoyaltyPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getCachedTenantBySlug(slug)
  if (!tenant) notFound()
  const row = tenant as unknown as Record<string, unknown>
  const branding = getTenantBranding(row)
  const trackingStyle = readTrackingStyle(row)
  return (
    <div style={buildTrackingTheme(branding, trackingStyle)}>
      <TrackingOptionsProvider options={trackingStyle.options}>
        <LoyaltyWalletPage
          tenantId={tenant.id}
          tenantSlug={slug}
          storeName={tenant.name}
          logoUrl={branding.logoUrl}
        />
      </TrackingOptionsProvider>
    </div>
  )
}
