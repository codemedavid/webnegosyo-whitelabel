import { notFound } from 'next/navigation'
import { fetchCheckoutLeadByRef } from '@/app/actions/checkout-leads'
import { ConfirmationContent } from './confirmation-content'

interface ConfirmationPageProps {
  params: Promise<{ ref: string }>
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { ref } = await params
  const result = await fetchCheckoutLeadByRef(ref)

  if (!result.data) {
    notFound()
  }

  return <ConfirmationContent lead={result.data} />
}
