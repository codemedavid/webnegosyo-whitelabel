/**
 * Store-wide colour rows show what the storefront renders (brand editor v2,
 * Phase 3). The storefront resolves colours through getTenantBranding — a
 * coordinated palette, legacy brand_color, modal → cards fallbacks — which
 * the registry's own inherit chains didn't know about.
 */

import { getTenantBranding } from '@/lib/branding-utils'
import { resolveTenantColor, TENANT_COLOR_KEYS } from '@/lib/branding-studio/tenant-field-effective'

describe('resolveTenantColor', () => {
    it('shows the palette colour a blank field renders with', () => {
        const saved = { storefront_palette: 'fine dining' }

        const value = resolveTenantColor('background_color', {}, saved)

        expect(value).toBe(getTenantBranding(saved).background)
        expect(value).not.toBeUndefined()
    })

    it('shows the legacy brand colour that beats the accent field', () => {
        expect(resolveTenantColor('accent_color', {}, { brand_color: '#123456', accent_color: '#654321' })).toBe('#123456')
    })

    it('shows the cards colour under a blank quick-view background', () => {
        expect(resolveTenantColor('modal_background_color', {}, { cards_color: '#222222' })).toBe('#222222')
    })

    it('uses the draft over what is saved, and a cleared draft as blank', () => {
        expect(resolveTenantColor('cards_color', { cards_color: '#abcdef' }, { cards_color: '#111111' })).toBe('#abcdef')
        expect(resolveTenantColor('modal_background_color', { modal_background_color: '' }, { modal_background_color: '#ff0000', cards_color: '#222222' })).toBe('#222222')
    })

    it('knows nothing about fields the storefront reads elsewhere', () => {
        expect(resolveTenantColor('hero_title_color', {}, {})).toBeUndefined()
    })

    it('agrees with the storefront for every mapped field', () => {
        const saved = { storefront_palette: 'warm editorial', primary_color: '#202020', cards_color: '#fafafa' }
        const branding = getTenantBranding(saved) as unknown as Record<string, unknown>

        for (const [fieldId, key] of Object.entries(TENANT_COLOR_KEYS)) {
            expect([fieldId, resolveTenantColor(fieldId, {}, saved)]).toEqual([fieldId, branding[key]])
        }
    })
})
