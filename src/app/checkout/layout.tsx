import type { ReactNode } from 'react'
import { MarketingPixel } from '@/components/tracking/marketing-pixel'

/** /checkout and its confirmation pages are part of the funnel: they carry the platform pixel. */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingPixel />
      {children}
    </>
  )
}
