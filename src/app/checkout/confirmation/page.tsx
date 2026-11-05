import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'
import { CHECKOUT_LEAD_LOOKUP_RATE_LIMITED } from '@/lib/checkout-leads/confirmation'
import { FunnelWorld } from '@/components/funnel/funnel-world'

// A buyer's own payment page, reached by reference number: never indexed.
export const metadata: Metadata = {
  title: 'Complete your payment · SmartMenu',
  robots: { index: false, follow: false },
}

interface ConfirmationPageProps {
  searchParams: Promise<{ confirm?: string }>
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const { confirm } = await searchParams

  if (!confirm) {
    notFound()
  }

  const result = await fetchCheckoutLeadByRef(confirm)

  if (!result.data) {
    // A shared connection over the lookup limit is not an unknown order.
    if (result.error === CHECKOUT_LEAD_LOOKUP_RATE_LIMITED) {
      return (
        <FunnelWorld>
          <main className="mx-auto max-w-md px-5 py-24 text-center">
            <p className="fn-lead">{CHECKOUT_LEAD_LOOKUP_RATE_LIMITED}</p>
          </main>
        </FunnelWorld>
      )
    }
    notFound()
  }

  return (
    <ConfirmationContent lead={result.data} />
  )
}
