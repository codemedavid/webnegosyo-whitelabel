import type { Metadata } from 'next'
import { FunnelPage } from '@/components/funnel/funnel-page'

const TITLE = 'SmartMenu: More Repeat Customers and Bigger Orders | ₱999/month'
const DESCRIPTION =
  'Get more customers ordering, bigger orders with automatic upsells, and regulars who come back with stamp cards and SMS. ₱999/month, free done-for-you setup, live in 48 hours. No lock-in.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website' },
  robots: { index: true, follow: true },
}

export default function FunnelRoute() {
  return <FunnelPage />
}
