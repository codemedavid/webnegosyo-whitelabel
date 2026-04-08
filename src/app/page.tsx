import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'
import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

// Disable static generation for this page to allow dynamic tenant detection
export const dynamic = 'force-dynamic'
export const revalidate = 0
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

export const metadata: Metadata = {
  title: 'WebNegosyo - You Can Sell More With Smart Menu',
  description: 'Smart Menu System na nag-a-automate ng upsells, bundles, at upgrades para sa food businesses. One-time ₱3,899.',
  keywords: ['smart menu', 'restaurant menu engineering', 'upsell system', 'food business Philippines', 'online ordering', 'bundle system', 'average order value'],
  openGraph: {
    title: 'WebNegosyo - You Can Sell More With Smart Menu',
    description: 'Smart Menu System na nag-a-automate ng upsells, bundles, at upgrades para sa food businesses.',
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
      <MetaPixelBootstrap pixelId={META_PIXEL_ID} />
      <LandingPage />
    </>
  )
}
