import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'
import { isWellFormedOnboardingToken } from '@/lib/onboarding/token'

interface ConfirmationPageProps {
  searchParams: Promise<{ confirm?: string; setup?: string }>
}

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const { confirm, setup } = await searchParams

  if (!confirm) {
    notFound()
  }

  const result = await fetchCheckoutLeadByRef(confirm)

  if (!result.data) {
    notFound()
  }

  return (
    <ConfirmationContent
      lead={result.data}
      setupToken={isWellFormedOnboardingToken(setup) ? setup : null}
    />
  )
}
