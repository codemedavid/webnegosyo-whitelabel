import { contrastRatio } from '@/lib/color-contrast'
import { readSectionScheme, schemeColors, sectionSchemesSchema } from '@/lib/section-schemes'

describe('section schemes', () => {
    it.each(['light', 'tinted', 'brand', 'dark'] as const)('%s keeps its text readable for any brand', (scheme) => {
        for (const brand of ['#e8b83f', '#1a1a1a', '#ffffff', '#2a6fdb', '#ffe066']) {
            const colors = schemeColors(scheme, brand)
            expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5)
            expect(contrastRatio(colors.muted, colors.background)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('paints the brand style in the brand colour', () => {
        expect(schemeColors('brand', '#e8b83f').background).toBe('#e8b83f')
    })

    it('reads a known style and ignores auto and junk', () => {
        expect(readSectionScheme({ section_schemes: { header: 'dark' } }, 'header')).toBe('dark')
        expect(readSectionScheme({ section_schemes: { header: 'auto' } }, 'header')).toBeNull()
        expect(readSectionScheme({ section_schemes: { header: 'neon' } }, 'header')).toBeNull()
        expect(readSectionScheme({ section_schemes: 'dark' }, 'header')).toBeNull()
    })

    it('refuses unknown sections and styles on write', () => {
        expect(() => sectionSchemesSchema.parse({ footer: 'dark' })).toThrow()
        expect(() => sectionSchemesSchema.parse({ header: 'neon' })).toThrow()
        expect(sectionSchemesSchema.parse({ header: 'brand' })).toEqual({ header: 'brand' })
    })
})

describe('header colour style on the storefront', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTenantBranding } = require('@/lib/branding-utils') as typeof import('@/lib/branding-utils')

    it('paints the header and keeps its text readable', () => {
        const branding = getTenantBranding({ accent_color: '#E8B83F', header_color: '#111111', menu_main_header_text_color: '#ffffff', section_schemes: { header: 'brand' } })

        expect(branding.header).toBe('#E8B83F')
        expect(contrastRatio(branding.menuMainHeaderText, branding.header)).toBeGreaterThanOrEqual(4.5)
    })

    it('leaves the header alone on auto', () => {
        expect(getTenantBranding({ header_color: '#123456', section_schemes: { header: 'auto' } }).header).toBe('#123456')
    })
})
