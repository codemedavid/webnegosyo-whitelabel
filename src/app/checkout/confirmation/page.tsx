import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'
import { CHECKOUT_LEAD_LOOKUP_RATE_LIMITED } from '@/lib/checkout-leads/confirmation'

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
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-base text-gray-700">{CHECKOUT_LEAD_LOOKUP_RATE_LIMITED}</p>
        </main>
      )
    }
    notFound()
  }

  return (
    <ConfirmationContent lead={result.data} />
  )
}
