import { renderToStaticMarkup } from 'react-dom/server'
import { MetaPixelBootstrap } from '@/components/tracking/meta-pixel-bootstrap'

describe('MetaPixelBootstrap', () => {
  it('renders the standard bootstrap script and noscript fallback when a pixel id is provided', () => {
    const html = renderToStaticMarkup(<MetaPixelBootstrap pixelId="123456789" />)

    expect(html).toContain("fbq('init', '123456789')")
    expect(html).toContain("fbq('track', 'PageView')")
    expect(html).toContain('https://connect.facebook.net/en_US/fbevents.js')
    expect(html).toContain('https://www.facebook.com/tr?id=123456789&amp;ev=PageView&amp;noscript=1')
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
