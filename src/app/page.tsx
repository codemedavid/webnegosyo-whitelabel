import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/landing-page'

// Static generation with revalidation
export const revalidate = 3600 // Revalidate every hour

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

export default function HomePage() {
  return <LandingPage />
}
