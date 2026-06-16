import {
  sanitizeExternalUrl,
  getFooterConfig,
} from '@/lib/footer-utils'

describe('sanitizeExternalUrl', () => {
  it('allows http and https URLs unchanged', () => {
    expect(sanitizeExternalUrl('https://facebook.com/shop')).toBe(
      'https://facebook.com/shop',
    )
    expect(sanitizeExternalUrl('http://example.com')).toBe('http://example.com')
  })

  it('strips javascript: scheme URLs', () => {
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBe('')
    // Case-insensitive and whitespace-tolerant variants.
    expect(sanitizeExternalUrl('JavaScript:alert(1)')).toBe('')
    expect(sanitizeExternalUrl('  javascript:alert(1)')).toBe('')
  })

  it('strips data: and vbscript: scheme URLs', () => {
    expect(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(
      '',
    )
    expect(sanitizeExternalUrl('vbscript:msgbox(1)')).toBe('')
  })

  it('returns empty string for empty or non-string input', () => {
    expect(sanitizeExternalUrl('')).toBe('')
    expect(sanitizeExternalUrl('   ')).toBe('')
    // @ts-expect-error testing runtime guard against non-string
    expect(sanitizeExternalUrl(undefined)).toBe('')
  })
})

describe('getFooterConfig URL sanitization', () => {
  it('drops unsafe javascript: social URLs', () => {
    const config = getFooterConfig({
      footer_facebook_url: 'javascript:alert(document.cookie)',
      footer_instagram_url: 'https://instagram.com/shop',
    })

    expect(config.socials.facebook.url).toBe('')
    expect(config.socials.instagram.url).toBe('https://instagram.com/shop')
  })

  it('drops unsafe logo URLs', () => {
    const config = getFooterConfig({
      footer_logo_url: 'javascript:alert(1)',
    })

    expect(config.logoUrl).toBe('')
  })

  it('keeps safe https logo URLs', () => {
    const config = getFooterConfig({
      footer_logo_url: 'https://res.cloudinary.com/x/logo.png',
    })

    expect(config.logoUrl).toBe('https://res.cloudinary.com/x/logo.png')
  })
})
