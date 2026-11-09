import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FunnelPage } from '@/components/funnel/funnel-page'
import { FUNNEL_METADATA } from '@/components/funnel/funnel-metadata'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

// Disable static generation for this page to allow dynamic tenant detection
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The platform homepage serves the sales funnel for now (owner, 2026-11-04).
 * The previous landing page is still `@/components/landing/landing-page`;
 * render `<LandingPage />` here again to switch back.
 */
export const metadata: Metadata = FUNNEL_METADATA

export default async function HomePage() {
  // A tenant subdomain never shows the platform homepage (middleware rewrites it; this is the fallback)
  const tenantSlug = await getTenantSlugFromHeaders()
  if (tenantSlug) {
    redirect(`/${tenantSlug}/menu`)
  }

  return <FunnelPage />
}
