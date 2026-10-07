import { describe, it, expect } from '@jest/globals'
import { renderQrArtwork, safeAccentColor, storeInitials, type QrArtworkInput } from '@/lib/qr-print/qr-artwork'

const LOGO = 'data:image/png;base64,iVBORw0KGgo='

const input = (overrides: Partial<QrArtworkInput> = {}): QrArtworkInput => ({
  url: 'https://cafe.webnegosyo.com/menu?table=12',
  design: 'card',
  storeName: 'Kape & Co.',
  title: 'Table 12',
  subtitle: 'North branch',
  caption: 'Scan to see the menu and order',
  accentColor: '#c2410c',
  logoDataUrl: LOGO,
  ...overrides,
})

describe('renderQrArtwork', () => {
  it('draws a standalone SVG document with the store, the table and the link', () => {
    const artwork = renderQrArtwork(input())!
    expect(artwork.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(artwork.svg).toContain('Kape &amp; Co.')
    expect(artwork.svg).toContain('Table 12')
    expect(artwork.svg).toContain('North branch')
    expect(artwork.svg).toContain('cafe.webnegosyo.com/menu?table=12')
    expect(artwork.width).toBeLessThan(artwork.height)
  })

  it('puts the logo in the middle of the code', () => {
    const { svg } = renderQrArtwork(input())!
    expect(svg).toContain(`href="${LOGO}"`)
  })

  it('falls back to the store initials when there is no logo', () => {
    const { svg } = renderQrArtwork(input({ logoDataUrl: null }))!
    expect(svg).not.toContain('<image')
    expect(svg).toContain('>KC<')
  })

  it('refuses a logo that is not an embedded image', () => {
    const { svg } = renderQrArtwork(input({ logoDataUrl: 'javascript:alert(1)' }))!
    expect(svg).not.toContain('javascript:')
    expect(svg).not.toContain('<image')
  })

  it('escapes merchant text so a store name cannot inject markup', () => {
    const { svg } = renderQrArtwork(input({ storeName: '<script>x</script>', title: '"><g onload=1>' }))!
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<g onload')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('draws only the code, square, for the plain design', () => {
    const artwork = renderQrArtwork(input({ design: 'plain' }))!
    expect(artwork.width).toBe(artwork.height)
    expect(artwork.svg).not.toContain('Table 12')
    expect(artwork.svg).toContain(`href="${LOGO}"`)
  })

  it('leaves the title out when there is none', () => {
    const { svg } = renderQrArtwork(input({ title: null, subtitle: null }))!
    expect(svg).not.toContain('Table 12')
  })

  it('returns null when the link cannot fit a QR code', () => {
    expect(renderQrArtwork(input({ url: `https://x.ph/${'a'.repeat(5000)}` }))).toBeNull()
  })
})

describe('safeAccentColor', () => {
  it('keeps a hex colour', () => {
    expect(safeAccentColor('#C2410C')).toBe('#c2410c')
    expect(safeAccentColor('#abc')).toBe('#abc')
  })

  it('replaces anything else with the default ink', () => {
    expect(safeAccentColor('red;}')).toBe('#111827')
    expect(safeAccentColor(null)).toBe('#111827')
  })
})

describe('storeInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(storeInitials('Kape & Co.')).toBe('KC')
    expect(storeInitials('jollibee')).toBe('J')
    expect(storeInitials('   ')).toBe('')
  })
})
