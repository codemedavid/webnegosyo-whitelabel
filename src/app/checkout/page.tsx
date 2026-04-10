import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'
import { CheckoutPageClient } from '@/app/checkout/checkout-page-client'

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

export const metadata = {
  title: 'Checkout - WebNegosyo Smart Menu System',
  description: 'Complete your purchase of the Smart Menu System. One-time ₱3,899.',
}

export default function CheckoutPage() {
  return (
    <>
      <MetaPixelBootstrap pixelId={META_PIXEL_ID} />
      <CheckoutPageClient />
    </>
  )
}
