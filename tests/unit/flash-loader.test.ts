import {
  buildFlashScreenBranding,
  isFlashScreenEnabled,
  resolveFlashScreenBranding,
} from '@/lib/flash-loader'
import type { Tenant } from '@/types/database'

// A minimal tenant factory: only the fields the resolver reads matter.
function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    name: 'Bella Pizza',
    slug: 'bella',
    logo_url: '',
    flash_screen_feature_enabled: true,
    flash_screen_is_active: true,
    ...overrides,
  } as Tenant
}

describe('isFlashScreenEnabled', () => {
  it('is true only when the superadmin feature flag AND the admin toggle are both on', () => {
    expect(isFlashScreenEnabled(makeTenant())).toBe(true)
  })

  it('is false when the superadmin feature flag is off even if the admin toggled it active', () => {
    expect(
      isFlashScreenEnabled(makeTenant({ flash_screen_feature_enabled: false })),
    ).toBe(false)
  })

  it('is false when the admin toggle is off', () => {
    expect(
      isFlashScreenEnabled(makeTenant({ flash_screen_is_active: false })),
    ).toBe(false)
  })

  it('is false for a null tenant', () => {
    expect(isFlashScreenEnabled(null)).toBe(false)
  })
})

describe('resolveFlashScreenBranding', () => {
  it('returns null when the flash screen is not enabled (so callers fall back to skeletons)', () => {
    expect(
      resolveFlashScreenBranding(makeTenant({ flash_screen_is_active: false })),
    ).toBeNull()
  })

  it('returns branding when enabled', () => {
    const branding = resolveFlashScreenBranding(
      makeTenant({
        flash_screen_title: 'Warming the oven…',
        flash_screen_subtitle: 'One moment',
        flash_screen_image_url: 'https://cdn/flash.png',
        flash_screen_background_color: '#0a0a0a',
        flash_screen_text_color: '#fafafa',
      }),
    )

    expect(branding).toEqual({
      title: 'Warming the oven…',
      subtitle: 'One moment',
      imageUrl: 'https://cdn/flash.png',
      initial: 'B',
      backgroundColor: '#0a0a0a',
      textColor: '#fafafa',
    })
  })
})

describe('buildFlashScreenBranding (no enable gate — used for admin preview)', () => {
  it('applies sensible defaults when optional fields are blank', () => {
    const branding = buildFlashScreenBranding(
      makeTenant({
        flash_screen_title: '',
        flash_screen_subtitle: '',
        flash_screen_image_url: '',
        flash_screen_background_color: '',
        flash_screen_text_color: '',
        logo_url: '',
      }),
    )

    expect(branding.title).toBe('Loading…')
    expect(branding.subtitle).toBeNull()
    expect(branding.imageUrl).toBeNull()
    expect(branding.backgroundColor).toBe('#111111')
    expect(branding.textColor).toBe('#ffffff')
    expect(branding.initial).toBe('B')
  })

  it('falls back to the tenant logo when no dedicated flash image is set', () => {
    const branding = buildFlashScreenBranding(
      makeTenant({ flash_screen_image_url: '', logo_url: 'https://cdn/logo.png' }),
    )
    expect(branding.imageUrl).toBe('https://cdn/logo.png')
  })

  it('derives the initial from the slug when the name is empty', () => {
    const branding = buildFlashScreenBranding(
      makeTenant({ name: '', slug: 'zesty' }),
    )
    expect(branding.initial).toBe('Z')
  })
})
