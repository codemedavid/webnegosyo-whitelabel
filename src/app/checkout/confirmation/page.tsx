import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'

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
    notFound()
  }

  return <ConfirmationContent lead={result.data} />
}
