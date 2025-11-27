import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

// Disable static generation for this page to allow dynamic tenant detection
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'WebNegosyo - Smart Menu System for Filipino Businesses',
  description: 'Your customers order online. You get every order in Messenger. Beautiful online menu, simple ordering. Starting at ₱999 one-time payment. No login required, all orders come to your Messenger.',
  keywords: ['restaurant menu', 'online ordering', 'messenger ordering', 'Philippines', 'food ordering system', 'restaurant management'],
  openGraph: {
    title: 'WebNegosyo - Smart Menu System for Filipino Businesses',
    description: 'Your customers order online. You get every order in Messenger.',
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
