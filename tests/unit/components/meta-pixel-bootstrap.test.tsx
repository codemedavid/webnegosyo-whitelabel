import { renderToStaticMarkup } from 'react-dom/server'
import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'

/**
 * The bootstrap goes through next/script (`afterInteractive`) so it no longer
 * blocks parsing as a raw inline <script> in <head>. next/script renders
 * nothing under renderToStaticMarkup, so it is mocked as a plain <script>
 * carrying the strategy — the assertions below cover both the pixel code and
 * the loading strategy.
 */
jest.mock('next/script', () => ({
  __esModule: true,
  default: ({ id, strategy, dangerouslySetInnerHTML }: {
    id?: string
    strategy?: string
    dangerouslySetInnerHTML?: { __html: string }
  }) => <script id={id} data-strategy={strategy} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />,
}))

describe('MetaPixelBootstrap', () => {
  it('renders the standard bootstrap script and noscript fallback when a pixel id is provided', () => {
    const html = renderToStaticMarkup(<MetaPixelBootstrap pixelId="123456789" />)

    expect(html).toContain("fbq('init', '123456789')")
    expect(html).toContain("fbq('track', 'PageView')")
    expect(html).toContain('https://connect.facebook.net/en_US/fbevents.js')
    expect(html).toContain('https://www.facebook.com/tr?id=123456789&amp;ev=PageView&amp;noscript=1')
  })

  it('loads the bootstrap through next/script after hydration instead of a blocking inline script', () => {
    const html = renderToStaticMarkup(<MetaPixelBootstrap pixelId="123456789" />)

    expect(html).toContain('data-strategy="afterInteractive"')
    expect(html).toContain('id="meta-pixel-bootstrap"')
  })

  it('uses the provided pixel id in the bootstrap init call', () => {
    const html = renderToStaticMarkup(<MetaPixelBootstrap pixelId="987654321" />)

    expect(html).toContain("fbq('init', '987654321')")
    expect(html).not.toContain("fbq('init', '939808131983849')")
  })

  it('renders nothing when the pixel id is missing', () => {
    const html = renderToStaticMarkup(<MetaPixelBootstrap />)

    expect(html).toBe('')
  })
})
