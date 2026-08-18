import { describe, it, expect } from '@jest/globals'
import {
  DEFAULT_WELCOME_CTA_TEXT,
  normalizeWelcomeBanners,
  resolveWelcomeCtaText,
  resolveWelcomeEntryMode,
  resolveWelcomeTheme,
  shouldShowOrderTypeStep,
  type WelcomeTenantFields,
} from '@/lib/outlets/welcome-page'

/**
 * The multi-branch welcome page (mode tiles → branch list) is becoming a
 * branded starter page: its own promo banners in three formats, its own
 * palette, and a per-tenant choice between the order-type tiles or one big
 * "Start Ordering" button that jumps straight to the branch list.
 *
 * Every existing tenant row predates all of these columns, so an absent or
 * garbage value must reproduce today's screen exactly: order-type tiles,
 * no banners, default styling.
 */

describe('resolveWelcomeEntryMode', () => {
  it('is "order_types" when the column is missing (existing tenant rows)', () => {
    expect(resolveWelcomeEntryMode({})).toBe('order_types')
  })

  it('is "order_types" for a null tenant', () => {
    expect(resolveWelcomeEntryMode(null)).toBe('order_types')
  })

  it('is "order_types" for an unrecognised value rather than hiding both entry paths', () => {
    const tenant = { welcome_entry_mode: 'mystery' } as WelcomeTenantFields
    expect(resolveWelcomeEntryMode(tenant)).toBe('order_types')
  })

  it('is "single_cta" only when explicitly set', () => {
    expect(resolveWelcomeEntryMode({ welcome_entry_mode: 'single_cta' })).toBe('single_cta')
  })

  it('reads "order_types" back when explicitly set', () => {
    expect(resolveWelcomeEntryMode({ welcome_entry_mode: 'order_types' })).toBe('order_types')
  })
})

describe('shouldShowOrderTypeStep', () => {
  it('shows the tiles for a tenant that has configured nothing', () => {
    expect(shouldShowOrderTypeStep({})).toBe(true)
  })

  it('hides the tiles when the merchant chose the single CTA', () => {
    expect(shouldShowOrderTypeStep({ welcome_entry_mode: 'single_cta' })).toBe(false)
  })

  it('hides the tiles when the merchant toggled them off', () => {
    expect(shouldShowOrderTypeStep({ welcome_show_order_types: false })).toBe(false)
  })

  it('shows the tiles when the toggle is explicitly on', () => {
    expect(shouldShowOrderTypeStep({ welcome_show_order_types: true })).toBe(true)
  })

  it('single CTA wins even if the toggle is on — one entry path at a time', () => {
    const tenant: WelcomeTenantFields = {
      welcome_entry_mode: 'single_cta',
      welcome_show_order_types: true,
    }
    expect(shouldShowOrderTypeStep(tenant)).toBe(false)
  })
})

describe('resolveWelcomeCtaText', () => {
  it('defaults to "Start Ordering" when unset', () => {
    expect(resolveWelcomeCtaText({})).toBe(DEFAULT_WELCOME_CTA_TEXT)
  })

  it('defaults when the stored text is blank or whitespace', () => {
    expect(resolveWelcomeCtaText({ welcome_cta_text: '   ' })).toBe(DEFAULT_WELCOME_CTA_TEXT)
  })

  it('returns the merchant custom text trimmed', () => {
    expect(resolveWelcomeCtaText({ welcome_cta_text: ' Order Na! ' })).toBe('Order Na!')
  })
})

describe('normalizeWelcomeBanners', () => {
  it('returns an empty list for a tenant with no banners column', () => {
    expect(normalizeWelcomeBanners(undefined)).toEqual([])
    expect(normalizeWelcomeBanners(null)).toEqual([])
  })

  it('returns an empty list when the column holds something other than an array', () => {
    expect(normalizeWelcomeBanners('not-banners')).toEqual([])
    expect(normalizeWelcomeBanners({ imageUrl: 'x' })).toEqual([])
  })

  it('drops entries without a usable image URL', () => {
    const banners = normalizeWelcomeBanners([
      { id: 'a', imageUrl: 'https://cdn/one.jpg', format: 'square' },
      { id: 'b', imageUrl: '' },
      { id: 'c' },
      null,
    ])
    expect(banners.map((b) => b.id)).toEqual(['a'])
  })

  it('coerces an unknown format to landscape instead of dropping the banner', () => {
    const banners = normalizeWelcomeBanners([
      { id: 'a', imageUrl: 'https://cdn/one.jpg', format: 'panoramic' },
      { id: 'b', imageUrl: 'https://cdn/two.jpg' },
    ])
    expect(banners.map((b) => b.format)).toEqual(['landscape', 'landscape'])
  })

  it('keeps the three supported formats as-is', () => {
    const banners = normalizeWelcomeBanners([
      { id: 'a', imageUrl: 'u', format: 'landscape' },
      { id: 'b', imageUrl: 'u', format: 'portrait' },
      { id: 'c', imageUrl: 'u', format: 'square' },
    ])
    expect(banners.map((b) => b.format)).toEqual(['landscape', 'portrait', 'square'])
  })

  it('preserves order, titles and descriptions', () => {
    const banners = normalizeWelcomeBanners([
      { id: 'b', imageUrl: 'u2', format: 'portrait', title: 'Promo', description: 'Half price' },
      { id: 'a', imageUrl: 'u1', format: 'square' },
    ])
    expect(banners[0]).toEqual({
      id: 'b',
      imageUrl: 'u2',
      format: 'portrait',
      title: 'Promo',
      description: 'Half price',
    })
    expect(banners[1].id).toBe('a')
  })
})

describe('resolveWelcomeTheme', () => {
  it('is all-null for an unconfigured tenant so the screen keeps its default styling', () => {
    const theme = resolveWelcomeTheme({})
    expect(theme).toEqual({
      backgroundColor: null,
      headingColor: null,
      subtextColor: null,
      tileBackgroundColor: null,
      tileIconColor: null,
      tileTextColor: null,
      ctaBackgroundColor: null,
      ctaTextColor: null,
    })
  })

  it('is all-null for a null tenant', () => {
    expect(resolveWelcomeTheme(null).backgroundColor).toBeNull()
  })

  it('passes explicit colors through', () => {
    const theme = resolveWelcomeTheme({
      welcome_background_color: '#111111',
      welcome_cta_background_color: '#22c55e',
    })
    expect(theme.backgroundColor).toBe('#111111')
    expect(theme.ctaBackgroundColor).toBe('#22c55e')
    expect(theme.headingColor).toBeNull()
  })

  it('treats an empty-string column as unset, not as a colour', () => {
    expect(resolveWelcomeTheme({ welcome_background_color: '' }).backgroundColor).toBeNull()
  })
})
