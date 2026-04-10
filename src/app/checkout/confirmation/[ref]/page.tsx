import { redirect } from 'next/navigation'

interface ConfirmationPageProps {
  params: Promise<{ ref: string }>
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { ref } = await params
  redirect(`/checkout/confirmation?confirm=${encodeURIComponent(ref)}`)
}
