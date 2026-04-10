import { CheckoutPageClient } from '@/app/checkout/checkout-page-client'

export const metadata = {
  title: 'Checkout - WebNegosyo Smart Menu System',
  description: 'Complete your purchase of the Smart Menu System. One-time ₱3,899.',
}

export default function CheckoutPage() {
  return (
    <>
      <CheckoutPageClient />
    </>
  )
}
