/**
 * The tracking page and loyalty card paint from `var(--trk-*)` built here.
 * A store that never touched the new settings must look exactly as before;
 * every setting must change what the page paints; text stays readable.
 */

import {
    darkenColor,
    generateBrandingCSS,
    getContrastColor,
    getTenantBranding,
    setAlpha,
    type BrandingColors,
} from '@/lib/branding-utils'
import { contrastRatio } from '@/lib/color-contrast'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'
import { listTrackingContrastIssues, resolveTrackingPalette } from '@/lib/tracking-style/palette'
import {
    DEFAULT_TRACKING_OPTIONS,
    TRACKING_CHOICES,
    TRACKING_COLOR_KEYS,
    TRACKING_TOGGLES,
    readTrackingStyle,
    type TrackingStyle,
} from '@/lib/tracking-style/keys'

/** The theme as it was before the Studio could edit it (2026-09-10 → 2026-10-19). */
function previousTheme(branding: BrandingColors): Record<string, string> {
    const accent = branding.primary
    return {
        ...(generateBrandingCSS(branding) as Record<string, string>),
        '--trk-bg': branding.background,
        '--trk-card': branding.cards,
        '--trk-card-border': branding.cardsBorder,
        '--trk-text': branding.textPrimary,
        '--trk-text-muted': branding.textSecondary,
        '--trk-text-faint': branding.textMuted,
        '--trk-accent': accent,
        '--trk-accent-soft': setAlpha(accent, 0.12),
        '--trk-accent-tint': setAlpha(accent, 0.06),
        '--trk-accent-strong': darkenColor(accent, 0.18),
        '--trk-on-accent': getContrastColor(accent),
        '--trk-cta': branding.buttonPrimary,
        '--trk-on-cta': branding.buttonPrimaryText,
        '--trk-success': branding.success,
        '--trk-success-soft': setAlpha(branding.success, 0.14),
        '--trk-warning': branding.warning,
        '--trk-warning-soft': setAlpha(branding.warning, 0.14),
        '--trk-error': branding.error,
    }
}

const STORES: Record<string, BrandingColors> = {
    default: getTenantBranding({}),
    dark: getTenantBranding({
        background_color: '#171717',
        cards_color: '#1a1a1a',
        text_primary_color: '#fafafa',
        primary_color: '#e8b83f',
        border_color: '#333333',
    }),
    lightAccent: getTenantBranding({ primary_color: '#ffe066', background_color: '#ffffff' }),
}

const DARK = STORES.dark

function style(colors: TrackingStyle['colors'] = {}, options: Partial<TrackingStyle['options']> = {}): TrackingStyle {
    return { colors, options: { ...DEFAULT_TRACKING_OPTIONS, ...options } }
}

function vars(branding: BrandingColors, trackingStyle?: TrackingStyle): Record<string, string> {
    return buildTrackingTheme(branding, trackingStyle) as Record<string, string>
}

describe('buildTrackingTheme with nothing set', () => {
    it.each(Object.entries(STORES))('keeps every variable the page used before (%s store)', (_name, branding) => {
        const theme = vars(branding)

        for (const [name, value] of Object.entries(previousTheme(branding))) {
            expect([name, theme[name]]).toEqual([name, value])
        }
    })

    it('paints the status banner, alert and loyalty band like before', () => {
        const theme = vars(DARK)
        const gradient = 'linear-gradient(135deg, var(--trk-accent), var(--trk-accent-strong))'
        const resolved = gradient.replace('var(--trk-accent)', '#e8b83f').replace('var(--trk-accent-strong)', darkenColor('#e8b83f', 0.18))

        expect(theme['--trk-hero-bg']).toBe(resolved)
        expect(theme['--trk-alert-bg']).toBe(resolved)
        expect(theme['--trk-band-bg']).toBe(resolved)
        expect(theme['--trk-hero-text']).toBe(getContrastColor('#e8b83f'))
        expect(theme['--trk-hero-bar']).toBe('#ffffff')
        expect(theme['--trk-stamp']).toBe('#e8b83f')
        expect(theme['--trk-loy-cta']).toBe(DARK.buttonPrimary)
    })
})

describe('buildTrackingTheme with the owner\'s settings', () => {
    it('changes something on the page for every colour setting', () => {
        const baseline = vars(DARK)
        const unchanged = TRACKING_COLOR_KEYS.filter((key) => {
            const theme = vars(DARK, style({ [key]: '#13579b' }))
            return Object.keys(theme).every((name) => theme[name] === baseline[name])
        })

        expect(unchanged).toEqual([])
    })

    it('changes something on the page for every choice and switch', () => {
        const baseline = vars(DARK)
        const choices = Object.entries(TRACKING_CHOICES).flatMap(([key, choice]) =>
            choice.options.filter((option) => option !== choice.default).map((option) => [key, option] as const)
        )
        const cssChoices = choices.filter(([key]) => !['loyalty_position', 'stamp_fill'].includes(key))
        const unchanged = cssChoices.filter(([key, option]) => {
            const theme = vars(DARK, style({}, { [key]: option }))
            return Object.keys(theme).every((name) => theme[name] === baseline[name])
        })

        expect(unchanged).toEqual([])
        expect(vars(DARK, style({}, { show_glow: false }))['--trk-glow']).toBe('transparent')
        expect(Object.keys(TRACKING_TOGGLES)).toContain('show_glow')
    })

    it('lets loyalty colours follow the page accent until the owner sets their own', () => {
        const theme = vars(DARK, style({ accent: '#2a6fdb' }))

        expect(theme['--trk-accent']).toBe('#2a6fdb')
        expect(theme['--trk-stamp']).toBe('#2a6fdb')
        expect(theme['--trk-loy-link']).toBe('#2a6fdb')
        expect(vars(DARK, style({ accent: '#2a6fdb', stamp_color: '#1a7f37' }))['--trk-stamp']).toBe('#1a7f37')
    })

    it('draws a solid, soft or outlined banner', () => {
        const solid = vars(DARK, style({ hero_color: '#2a6fdb' }, { hero_style: 'solid' }))
        const soft = vars(DARK, style({ hero_color: '#2a6fdb' }, { hero_style: 'soft' }))
        const outline = vars(DARK, style({ hero_color: '#2a6fdb' }, { hero_style: 'outline' }))

        expect(solid['--trk-hero-bg']).toBe('#2a6fdb')
        expect(soft['--trk-hero-bg']).toMatch(/^#[0-9a-f]{6}$/)
        expect(soft['--trk-hero-bg']).not.toBe('#2a6fdb')
        expect(outline['--trk-hero-bg']).toBe('#1a1a1a')
        expect(outline['--trk-hero-border']).toBe('#2a6fdb')
    })

    it('rounds the cards by the chosen corner style', () => {
        expect(vars(DARK)['--trk-radius']).toBe('1.5rem')
        expect(vars(DARK, style({}, { corners: 'square' }))['--trk-radius']).toBe('0.25rem')
        expect(vars(DARK, style({}, { stamp_shape: 'rounded' }))['--trk-stamp-radius']).toBe('30%')
    })
})

describe('readable text', () => {
    it('keeps unchosen text readable when the owner sets a white card on a dark store', () => {
        const palette = resolveTrackingPalette(DARK, style({ card_background: '#ffffff' }))

        expect(contrastRatio(palette.text, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(palette.textMuted, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps a chosen colour that reads exactly as chosen', () => {
        const palette = resolveTrackingPalette(DARK, style({ hero_color: '#1d1815', hero_text: '#f0e6d2' }))

        expect(palette.heroText).toBe('#f0e6d2')
    })

    it('shows readable ink instead of a chosen colour that does not read, and names it for the Studio', () => {
        const chosen = style({ loyalty_background: '#ffffff', loyalty_text: '#f5f5f5' })
        const palette = resolveTrackingPalette(DARK, chosen)
        const issues = listTrackingContrastIssues(DARK, chosen)

        expect(contrastRatio(palette.loyaltyText, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(issues).toEqual([expect.objectContaining({ key: 'loyalty_text', fix: palette.loyaltyText })])
    })

    it('checks banner text against both ends of the gradient', () => {
        const palette = resolveTrackingPalette(DARK, style({ hero_color: '#fff3b0', hero_color_end: '#1d1815', hero_text: '#ffffff' }))

        expect(contrastRatio(palette.heroText, '#fff3b0')).toBeGreaterThanOrEqual(4.5)
        const band = resolveTrackingPalette(DARK, style({ band_color: '#fff3b0', band_color_end: '#1d1815', band_text: '#ffffff' }))
        expect(contrastRatio(band.bandText, '#fff3b0')).toBeGreaterThanOrEqual(4.5)
    })

    it('reports nothing for a store that never set these colours', () => {
        expect(Object.values(STORES).flatMap((branding) => listTrackingContrastIssues(branding, style()))).toEqual([])
    })
})

describe('reading the tenant row', () => {
    it('builds the theme straight from the saved column', () => {
        const saved = readTrackingStyle({ tracking_style: { hero_color: '#2A6FDB', hero_style: 'solid' } })

        expect(vars(DARK, saved)['--trk-hero-bg']).toBe('#2a6fdb')
    })
})
