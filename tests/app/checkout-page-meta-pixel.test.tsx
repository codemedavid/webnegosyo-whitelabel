import { renderToStaticMarkup } from 'react-dom/server'
import CheckoutPage from '@/app/checkout/page'

jest.mock('@/app/checkout/checkout-page-client', () => ({
  CheckoutPageClient: () => <div>checkout page</div>,
}))

const originalMetaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

describe('CheckoutPage meta pixel rendering', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'test-pixel-id'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = originalMetaPixelId
  })

  it('does not inject a page-level Meta Pixel bootstrap', () => {
    const html = renderToStaticMarkup(<CheckoutPage />)

    expect(html).toContain('checkout page')
    expect(html).not.toContain('connect.facebook.net/en_US/fbevents.js')
    expect(html).not.toContain("fbq('init'")
  })
})
