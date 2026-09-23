/**
 * The branding write schema is the boundary for values the public storefront
 * later renders into `href`, `src` and inline CSS. Two gaps:
 *
 * - URL fields only had to parse as a URL (or not even that), so `javascript:`,
 *   `data:` and a `")` breakout into `url("…")` were storable.
 * - `mobile_overrides` accepted ANY key and ANY string, bypassing every
 *   per-field rule above (a mobile `background_image_url` skipped the URL rule).
 */
import { describe, it, expect } from '@jest/globals'
import { brandingPatchSchema, brandingSchema } from '@/lib/branding-service'

const BASE = { primary_color: '#111111', secondary_color: '#666666' }

const IMAGE_URL_FIELDS = [
  'logo_url',
  'background_image_url',
  'hero_image_url',
  'footer_logo_url',
  'flash_screen_image_url',
  'promotion_image_url',
] as const

const SOCIAL_URL_FIELDS = [
  'footer_facebook_url',
  'footer_instagram_url',
  'footer_tiktok_url',
  'footer_twitter_url',
  'footer_youtube_url',
] as const

const HOSTILE_URLS = [
  'javascript:alert(1)',
  'data:image/png;base64,AAAA',
  'https://x.com/a.png");background:url("https://evil.com/p',
  "https://x.com/a'.png",
  'https://x.com/a\n.png',
  '//evil.com/x.png',
]

describe('brandingSchema — URL fields', () => {
  it.each([...IMAGE_URL_FIELDS, ...SOCIAL_URL_FIELDS])('%s accepts an https URL and a blank', (field) => {
    expect(brandingSchema.safeParse({ ...BASE, [field]: 'https://ik.imagekit.io/x/a.png' }).success).toBe(true)
    expect(brandingSchema.safeParse({ ...BASE, [field]: '' }).success).toBe(true)
  })

  it.each(
    [...IMAGE_URL_FIELDS, ...SOCIAL_URL_FIELDS, 'hero_link_url'].flatMap((field) =>
      HOSTILE_URLS.map((url) => [field, url] as const),
    ),
  )('%s rejects %j', (field, url) => {
    expect(brandingSchema.safeParse({ ...BASE, [field]: url }).success).toBe(false)
  })

  it('names the offending field in the error', () => {
    const result = brandingPatchSchema.safeParse({ background_image_url: 'javascript:alert(1)' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues[0]?.path)).toContain('background_image_url')
  })

  it('hero_link_url still accepts a site path, which the hero renders as-is', () => {
    expect(brandingSchema.safeParse({ ...BASE, hero_link_url: '/menu/item/abc' }).success).toBe(true)
    expect(brandingSchema.safeParse({ ...BASE, hero_link_url: 'https://shop.example.com' }).success).toBe(true)
  })

  it('normalizes a social link typed without a scheme instead of refusing the publish', () => {
    const parsed = brandingSchema.parse({ ...BASE, footer_facebook_url: 'www.facebook.com/cafe' })
    expect(parsed.footer_facebook_url).toBe('https://www.facebook.com/cafe')
  })

  it.each(['promotion_banners', 'welcome_page_banners'] as const)('%s refuses a hostile banner imageUrl', (field) => {
    const banner = { id: 'b1', imageUrl: 'javascript:alert(1)', format: 'landscape' }
    expect(brandingSchema.safeParse({ ...BASE, [field]: [banner] }).success).toBe(false)
    const ok = { ...banner, imageUrl: 'https://ik.imagekit.io/x/a.png' }
    expect(brandingSchema.safeParse({ ...BASE, [field]: [ok] }).success).toBe(true)
  })
})

describe('brandingSchema — mobile_overrides', () => {
  it('accepts valid per-field overrides', () => {
    const result = brandingPatchSchema.safeParse({
      mobile_overrides: { header_color: '#ffffff', font_pair: 'modern sans', header_sticky: true, background_image_opacity: 40 },
    })
    expect(result.success).toBe(true)
  })

  it('validates an override value against its own field schema', () => {
    expect(
      brandingPatchSchema.safeParse({ mobile_overrides: { background_image_url: 'https://x.com/a.png");color:red' } }).success,
    ).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { header_color: 'red;}body{display:none' } }).success).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { font_pair: 'comic sans' } }).success).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { background_image_opacity: 900 } }).success).toBe(false)
  })

  it('refuses a real column that cannot be overridden per device', () => {
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { mobile_overrides: 'x' } }).success).toBe(false)
    expect(brandingPatchSchema.safeParse({ mobile_overrides: { promotion_banners: 'x' } }).success).toBe(false)
  })

  it('drops keys that are not branding fields at all (legacy editor keys) rather than storing them', () => {
    const parsed = brandingPatchSchema.parse({
      mobile_overrides: { cardLayout: 'grid', gridColumns: 2, is_active: false, header_color: '#000000' },
    })
    expect(parsed.mobile_overrides).toEqual({ header_color: '#000000' })
  })

  it('keeps a null override (inherit desktop)', () => {
    const parsed = brandingPatchSchema.parse({ mobile_overrides: { header_color: null } })
    expect(parsed.mobile_overrides).toEqual({ header_color: null })
  })
})
