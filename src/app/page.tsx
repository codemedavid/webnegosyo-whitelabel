import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

// Disable static generation for this page to allow dynamic tenant detection
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'WebNegosyo - Your Menu Should Be Your Best Salesperson',
  description: 'Smart Menu System na nagbo-boost ng Average Order Value para sa food businesses. Menu Engineering, Bundling System, at Upsell Automation. P3,499 one-time.',
  keywords: ['smart menu', 'restaurant menu engineering', 'upsell system', 'food business Philippines', 'online ordering', 'messenger ordering', 'average order value'],
  openGraph: {
    title: 'WebNegosyo - Your Menu Should Be Your Best Salesperson',
    description: 'Smart Menu System na nagbo-boost ng Average Order Value para sa food businesses.',
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
  return <LandingPage />
}
