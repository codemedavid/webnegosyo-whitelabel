import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/components/landing/landing-page', () => ({
  LandingPage: () => <div>landing page</div>,
}))

jest.mock('@/lib/tenant', () => ({
  getTenantSlugFromHeaders: jest.fn(),
}))

import HomePage from '@/app/page'
import { getTenantSlugFromHeaders } from '@/lib/tenant'

const mockedGetTenantSlugFromHeaders = jest.mocked(getTenantSlugFromHeaders)
const originalMetaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

describe('HomePage meta pixel rendering', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'test-pixel-id'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = originalMetaPixelId
  })

  it('does not inject a page-level Meta Pixel bootstrap', async () => {
    mockedGetTenantSlugFromHeaders.mockResolvedValue(null)

    const page = await HomePage()
    const html = renderToStaticMarkup(page)

    expect(html).toContain('landing page')
    expect(html).not.toContain('connect.facebook.net/en_US/fbevents.js')
    expect(html).not.toContain("fbq('init'")
  })
})
