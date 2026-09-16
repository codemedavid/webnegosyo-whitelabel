import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'geist-sans' }),
  Geist_Mono: () => ({ variable: 'geist-mono' }),
}))

jest.mock('@/hooks/useCart', () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/providers/query-provider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/components/shared/messenger-psid-capture', () => ({
  MessengerPsidCapture: () => null,
}))

jest.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}))

// next/script (afterInteractive) renders nothing under renderToStaticMarkup;
// stand in with a plain <script> so the pixel bootstrap is visible in markup.
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ dangerouslySetInnerHTML }: { dangerouslySetInnerHTML?: { __html: string } }) => (
    <script dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
  ),
}))

import RootLayout from '@/app/layout'

describe('RootLayout Meta Pixel', () => {
  const originalMetaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

  beforeAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = '123456789'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = originalMetaPixelId
  })

  it('renders the Meta Pixel snippet and noscript beacon from the configured pixel id', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    )

    expect(html).toContain('https://connect.facebook.net/en_US/fbevents.js')
    expect(html).toContain("fbq('init', '123456789')")
    expect(html).toContain('https://www.facebook.com/tr?id=123456789&amp;ev=PageView&amp;noscript=1')
  })

  it('does not ship the mapbox-gl stylesheet to every page', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>content</div>
      </RootLayout>
    )

    expect(html).not.toContain('mapbox-gl.css')
  })
})
