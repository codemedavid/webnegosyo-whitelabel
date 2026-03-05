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

describe('generateBrandingCSS', () => {
  it('generates CSS custom properties', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branding = getTenantBranding(TENANT_FIXTURE.tenant1 as any)
    const css = generateBrandingCSS(branding)
    
    expect(css['--brand-background']).toBe('#ffffff')
    expect(css['--brand-primary']).toBe('#ff0000')
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
