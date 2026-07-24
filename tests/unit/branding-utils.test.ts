import { describe, it, expect } from '@jest/globals'
import {
  getTenantBranding,
  generateBrandingCSS,
  getContrastColor,
  lightenColor,
  darkenColor,
  isValidHexColor,
  hexToRgb,
  rgbToHex,
  generateBrandingClasses,
  DEFAULT_BRANDING,
} from '@/lib/branding-utils'
import { STOREFRONT_PALETTES } from '@/lib/storefront-theme'
import { TENANT_FIXTURE } from '../fixtures/fixtures'

describe('getTenantBranding', () => {
  it('returns default branding for null tenant', () => {
    const branding = getTenantBranding(null)
    expect(branding).toEqual(DEFAULT_BRANDING)
  })

  it('extracts tenant colors with fallbacks', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branding = getTenantBranding(TENANT_FIXTURE.tenant1 as any)
    expect(branding.primary).toBe('#ff0000')
    expect(branding.background).toBe('#ffffff')
  })

  it('uses default colors for missing tenant colors', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branding = getTenantBranding(TENANT_FIXTURE.tenant2 as any)
    expect(branding.background).toBe(DEFAULT_BRANDING.background)
  })
})

describe('getTenantBranding — logo fallback', () => {
  it('exposes the tenant logo_url as logoUrl for image fallbacks', () => {
    const branding = getTenantBranding({ logo_url: 'https://cdn.test/brand-logo.png' })
    expect(branding.logoUrl).toBe('https://cdn.test/brand-logo.png')
  })

  it('returns null logoUrl when the tenant has no logo', () => {
    expect(getTenantBranding({}).logoUrl).toBeNull()
  })

  it('returns null logoUrl when logo_url is an empty string', () => {
    expect(getTenantBranding({ logo_url: '' }).logoUrl).toBeNull()
  })

  it('DEFAULT_BRANDING has a null logoUrl', () => {
    expect(DEFAULT_BRANDING.logoUrl).toBeNull()
    expect(getTenantBranding(null).logoUrl).toBeNull()
  })
})

describe('getTenantBranding — storefront theme knobs', () => {
  it('lets brand_color override the accent color', () => {
    const branding = getTenantBranding({ accent_color: '#ffd700', brand_color: '#E4572E' })
    expect(branding.accent).toBe('#E4572E')
  })

  it('falls back to accent_color when brand_color is unset', () => {
    const branding = getTenantBranding({ accent_color: '#ffd700' })
    expect(branding.accent).toBe('#ffd700')
  })

  it('resolves font_pair into heading and body fonts', () => {
    const branding = getTenantBranding({ font_pair: 'warm editorial' })
    expect(branding.headingFont).toBe("'Lora', serif")
    expect(branding.bodyFont).toBe("'Karla', sans-serif")
  })

  it('resolves font_pair into the heading weight', () => {
    expect(getTenantBranding({ font_pair: 'warm editorial' }).headingWeight).toBe(500)
    expect(getTenantBranding({ font_pair: 'bold display' }).headingWeight).toBe(400)
    expect(getTenantBranding({ font_pair: 'modern sans' }).headingWeight).toBe(900)
  })

  it('leaves fonts null for the "theme" sentinel and when unset', () => {
    expect(getTenantBranding({ font_pair: 'theme' }).headingFont).toBeNull()
    expect(getTenantBranding({}).headingFont).toBeNull()
    expect(getTenantBranding({}).bodyFont).toBeNull()
    expect(getTenantBranding({}).headingWeight).toBeNull()
  })

  it('resolves card_roundness into a pixel radius string', () => {
    expect(getTenantBranding({ card_roundness: 'soft' }).radius).toBe('10px')
    expect(getTenantBranding({ card_roundness: 'sharp' }).radius).toBe('0px')
    expect(getTenantBranding({ card_roundness: 'round' }).radius).toBe('22px')
  })

  it('leaves radius null for the "theme" sentinel and when unset', () => {
    expect(getTenantBranding({ card_roundness: 'theme' }).radius).toBeNull()
    expect(getTenantBranding({}).radius).toBeNull()
  })

  it('keeps the new knob fields null on DEFAULT_BRANDING', () => {
    expect(DEFAULT_BRANDING.headingFont).toBeNull()
    expect(DEFAULT_BRANDING.bodyFont).toBeNull()
    expect(DEFAULT_BRANDING.headingWeight).toBeNull()
    expect(DEFAULT_BRANDING.radius).toBeNull()
  })
})

describe('getTenantBranding — storefront palette (coordinated theme)', () => {
  it('is a pure no-op when no palette is selected (zero regression)', () => {
    // The exact same tenant, with and without an (unset) palette field, must
    // resolve to byte-identical branding so existing storefronts never shift.
    const tenant = { accent_color: '#ffd700', background_color: '#fafafa', primary_color: '#222' }
    expect(getTenantBranding({ ...tenant, storefront_palette: 'theme' })).toEqual(
      getTenantBranding(tenant)
    )
    expect(getTenantBranding({ ...tenant, storefront_palette: '' })).toEqual(
      getTenantBranding(tenant)
    )
  })

  it('restyles coordinated color roles when a palette is selected', () => {
    const p = STOREFRONT_PALETTES['fine dining']
    const branding = getTenantBranding({ storefront_palette: 'fine dining' })
    expect(branding.background).toBe(p.bg)
    expect(branding.accent).toBe(p.accent)
    expect(branding.textPrimary).toBe(p.text)
    expect(branding.border).toBe(p.line)
    expect(branding.buttonPrimary).toBe(p.accent)
    expect(branding.buttonPrimaryText).toBe(p.accentInk)
  })

  it('lets an explicit per-field color still override the palette', () => {
    const branding = getTenantBranding({
      storefront_palette: 'fine dining',
      background_color: '#123456',
      accent_color: '#abcdef',
    })
    // Explicit columns win over the palette layer…
    expect(branding.background).toBe('#123456')
    // …while brand_color/accent_color still feeds accent as before.
    expect(branding.accent).toBe('#abcdef')
    // …and un-overridden roles still take the palette.
    expect(branding.textPrimary).toBe(STOREFRONT_PALETTES['fine dining'].text)
  })

  it('ignores an unknown palette id (falls back to existing defaults)', () => {
    expect(getTenantBranding({ storefront_palette: 'rainbow' })).toEqual(getTenantBranding({}))
  })
})

describe('generateBrandingCSS — storefront theme knobs', () => {
  it('emits radius and font vars only when the knobs are set', () => {
    const css = generateBrandingCSS(
      getTenantBranding({ card_roundness: 'round', font_pair: 'bold display' })
    ) as Record<string, string>
    expect(css['--brand-radius']).toBe('22px')
    expect(css['--brand-heading-font']).toBe("'Anton', sans-serif")
    expect(css['--brand-heading-weight']).toBe('400')
    expect(css['--brand-body-font']).toBe("'Archivo', sans-serif")
  })

  it('omits the knob vars when knobs are on the "theme" default', () => {
    const css = generateBrandingCSS(getTenantBranding({})) as Record<string, string>
    expect(css['--brand-radius']).toBeUndefined()
    expect(css['--brand-heading-font']).toBeUndefined()
    expect(css['--brand-heading-weight']).toBeUndefined()
    expect(css['--brand-body-font']).toBeUndefined()
  })

  it('reflects brand_color through the accent var', () => {
    const css = generateBrandingCSS(
      getTenantBranding({ brand_color: '#2A6F4E', primary_color: '#000000' })
    ) as Record<string, string>
    expect(css['--brand-accent']).toBe('#2A6F4E')
  })
})

describe('generateBrandingCSS', () => {
  it('generates CSS custom properties', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branding = getTenantBranding(TENANT_FIXTURE.tenant1 as any)
    const css = generateBrandingCSS(branding)
    
    expect((css as Record<string, string>)['--brand-background']).toBe('#ffffff')
    expect((css as Record<string, string>)['--brand-primary']).toBe('#ff0000')
  })

  it('includes all branding properties', () => {
    const branding = getTenantBranding(null)
    const css = generateBrandingCSS(branding)
    
    const keys = Object.keys(css)
    expect(keys.length).toBeGreaterThan(10)
    expect(keys).toContain('--brand-background')
    expect(keys).toContain('--brand-primary')
  })
})

describe('getContrastColor', () => {
  it('returns black for light backgrounds', () => {
    expect(getContrastColor('#ffffff')).toBe('#000000')
    expect(getContrastColor('#f0f0f0')).toBe('#000000')
  })

  it('returns white for dark backgrounds', () => {
    expect(getContrastColor('#000000')).toBe('#ffffff')
    expect(getContrastColor('#333333')).toBe('#ffffff')
  })

  it('handles various shades', () => {
    expect(getContrastColor('#808080')).toBe('#000000')
    expect(getContrastColor('#7f7f7f')).toBe('#ffffff')
  })
})

describe('lightenColor', () => {
  it('lightens a color', () => {
    // Math.floor(0 + (255 - 0) * 0.5) = Math.floor(127.5) = 127 = 0x7f
    expect(lightenColor('#000000', 0.5)).toBe('#7f7f7f')
    // Math.floor(255 + (255-255)*0.1)=255, Math.floor(0 + 255*0.1)=Math.floor(25.5)=25=0x19
    expect(lightenColor('#ff0000', 0.1)).toBe('#ff1919')
  })

  it('handles edge cases', () => {
    expect(lightenColor('#ffffff', 0.9)).toBe('#ffffff')
  })
})

describe('darkenColor', () => {
  it('darkens a color', () => {
    // Math.floor(255 * (1 - 0.5)) = Math.floor(127.5) = 127 = 0x7f
    expect(darkenColor('#ffffff', 0.5)).toBe('#7f7f7f')
    // Math.floor(255 * 0.9) = Math.floor(229.5) = 229 = 0xe5
    expect(darkenColor('#ff0000', 0.1)).toBe('#e50000')
  })

  it('handles edge cases', () => {
    expect(darkenColor('#000000', 0.9)).toBe('#000000')
  })
})

describe('isValidHexColor', () => {
  it('validates 6-digit hex colors', () => {
    expect(isValidHexColor('#ff0000')).toBe(true)
    expect(isValidHexColor('#00ff00')).toBe(true)
    expect(isValidHexColor('#0000ff')).toBe(true)
  })

  it('validates 3-digit hex colors', () => {
    expect(isValidHexColor('#f00')).toBe(true)
    expect(isValidHexColor('#0f0')).toBe(true)
    expect(isValidHexColor('#00f')).toBe(true)
  })

  it('rejects invalid colors', () => {
    expect(isValidHexColor('#gggggg')).toBe(false)
    expect(isValidHexColor('ff0000')).toBe(false)
    expect(isValidHexColor('#ff00')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })
})

describe('hexToRgb', () => {
  it('converts hex to RGB', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('handles hex without #', () => {
    expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('returns null for invalid hex', () => {
    expect(hexToRgb('gggggg')).toBeNull()
  })
})

describe('rgbToHex', () => {
  it('converts RGB to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00')
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff')
  })

  it('handles various RGB values', () => {
    expect(rgbToHex(128, 128, 128)).toBe('#808080')
    expect(rgbToHex(16, 16, 16)).toBe('#101010')
  })
})

describe('generateBrandingClasses', () => {
  it('generates CSS classes', () => {
    const branding = getTenantBranding(null)
    const classes = generateBrandingClasses(branding)

    expect(classes).toContain('.brand-bg')
    // generateBrandingClasses uses inline color values, not CSS variables
    expect(classes).toContain(branding.background)
  })

  it('includes all standard classes', () => {
    const branding = getTenantBranding(null)
    const classes = generateBrandingClasses(branding)
    
    const expectedClasses = [
      '.brand-bg',
      '.brand-header',
      '.brand-cards',
      '.brand-button-primary',
      '.brand-text-primary',
    ]
    
    expectedClasses.forEach(className => {
      expect(classes).toContain(className)
    })
  })
})
