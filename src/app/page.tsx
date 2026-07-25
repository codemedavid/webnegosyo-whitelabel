import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

// Disable static generation for this page to allow dynamic tenant detection
export const dynamic = 'force-dynamic'
export const revalidate = 0

const TITLE = 'WebNegosyo — Online Ordering Website na Kusang Nag-a-upsell'
const DESCRIPTION =
  'Sarili mong online ordering website para sa food business — smart menu na nag-a-automate ng upsells, bundles, at upgrades. Dine-in, pick-up at delivery. One-time ₱3,899, walang monthly fee, live in 48 hours.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'online ordering website',
    'smart menu',
    'restaurant menu engineering',
    'upsell system',
    'food business Philippines',
    'QR menu',
    'bundle system',
    'average order value',
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default async function HomePage() {
  // Check if this is a tenant subdomain request
  // If so, redirect to the tenant menu (middleware should handle rewrite, but this is a fallback)
  const tenantSlug = await getTenantSlugFromHeaders()
  
  if (tenantSlug) {
    // Redirect to tenant menu - this ensures we never show landing page on tenant subdomains
    redirect(`/${tenantSlug}/menu`)
  }
  
  // Only show landing page if not a tenant subdomain
  return (
    <>
      <LandingPage />
    </>
  )
}
