import type { Metadata } from 'next'
import { FunnelPage } from '@/components/funnel/funnel-page'
import { SIX_MONTH_PER_MONTH, formatPeso } from '@/components/funnel/funnel-offer'

const TITLE = `SmartMenu: Ordering, POS, Inventory, Loyalty at SMS | from ${formatPeso(SIX_MONTH_PER_MONTH)}/month`
const DESCRIPTION =
  'Ordering website (dine-in, pick-up, delivery), Lalamove, POS, inventory, expense tracker, loyalty, SMS marketing, analytics at automatic upsells in one system. 6 months for ₱5,499 with free done-for-you setup, or ₱1,499/month.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website' },
  robots: { index: true, follow: true },
}

export default function FunnelRoute() {
  return <FunnelPage />
}
