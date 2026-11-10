import type { Metadata } from 'next'
import { INSTALLMENT_PRICE, formatPeso } from './funnel-offer'

const TITLE = `SmartMenu: Ordering, POS, Inventory, Loyalty at SMS | from ${formatPeso(INSTALLMENT_PRICE)}/month`
const DESCRIPTION =
  'Ordering website (dine-in, pick-up, delivery), Lalamove, POS, inventory, expense tracker, loyalty, SMS marketing, analytics at automatic upsells in one system. 6 months for ₱5,499 with free done-for-you setup, or ₱1,499/month.'

/** Shared by /funnel and the homepage, which serves the funnel for now. */
export const FUNNEL_METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website' },
  robots: { index: true, follow: true },
}
