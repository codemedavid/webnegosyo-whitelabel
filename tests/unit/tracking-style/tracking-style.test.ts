/**
 * The owner's look for the order-tracking page and the loyalty card, stored in
 * `tenants.tracking_style` as a flat key → value object. Every key is either a
 * colour (blank = follow the brand), a choice or an on/off switch.
 */

import {
    DEFAULT_TRACKING_OPTIONS,
    TRACKING_CHOICES,
    TRACKING_COLOR_KEYS,
    TRACKING_STYLE_KEYS,
    TRACKING_TOGGLES,
    readTrackingStyle,
    trackingStyleSchema,
} from '@/lib/tracking-style/keys'

describe('tracking style keys', () => {
    it('keeps every key unique and snake_case', () => {
        expect(new Set(TRACKING_STYLE_KEYS).size).toBe(TRACKING_STYLE_KEYS.length)
        for (const key of TRACKING_STYLE_KEYS) expect(key).toMatch(/^[a-z][a-z0-9_]*$/)
    })

    it('gives every choice a default that is one of its options', () => {
        for (const [key, choice] of Object.entries(TRACKING_CHOICES)) {
            expect(choice.options).toContain(DEFAULT_TRACKING_OPTIONS[key as keyof typeof DEFAULT_TRACKING_OPTIONS])
        }
    })

    it('defaults every switch to on (today the page shows everything)', () => {
        for (const key of Object.keys(TRACKING_TOGGLES)) {
            expect(DEFAULT_TRACKING_OPTIONS[key as keyof typeof DEFAULT_TRACKING_OPTIONS]).toBe(true)
        }
    })
})

describe('trackingStyleSchema', () => {
    it('accepts colours, choices and switches it knows', () => {
        const parsed = trackingStyleSchema.safeParse({ hero_color: '#E4572E', hero_style: 'solid', show_timeline: false })

        expect(parsed.success).toBe(true)
    })

    it('refuses an unknown key', () => {
        expect(trackingStyleSchema.safeParse({ hero_colour: '#ffffff' }).success).toBe(false)
    })

    it('refuses anything that is not a hex colour in a colour key', () => {
        for (const value of ['red', 'url(javascript:1)', '#12', 'rgb(0,0,0)', '#ffffff; background:url(x)']) {
            expect(trackingStyleSchema.safeParse({ page_background: value }).success).toBe(false)
        }
    })

    it('refuses a choice outside its options and a non-boolean switch', () => {
        expect(trackingStyleSchema.safeParse({ hero_style: 'neon' }).success).toBe(false)
        expect(trackingStyleSchema.safeParse({ confetti: 'yes' }).success).toBe(false)
    })
})

describe('readTrackingStyle', () => {
    it('reads nothing from a store that never set a look', () => {
        const style = readTrackingStyle({})

        expect(style.colors).toEqual({})
        expect(style.options).toEqual(DEFAULT_TRACKING_OPTIONS)
    })

    it('keeps valid values, expands short hex and drops everything else', () => {
        const style = readTrackingStyle({
            tracking_style: {
                hero_color: '#abc',
                text: 'blue',
                hero_style: 'outline',
                stamp_shape: 'hexagon',
                show_timeline: false,
                confetti: 'no',
                __proto__: { polluted: true },
                constructor: '#ffffff',
            },
        })

        expect(style.colors).toEqual({ hero_color: '#aabbcc' })
        expect(style.options).toEqual({ ...DEFAULT_TRACKING_OPTIONS, hero_style: 'outline', show_timeline: false })
    })

    it('survives a column that is not an object', () => {
        for (const raw of [null, 'x', 4, ['#fff']]) {
            expect(readTrackingStyle({ tracking_style: raw }).colors).toEqual({})
        }
    })

    it('lists every colour key under TRACKING_COLOR_KEYS', () => {
        expect(TRACKING_COLOR_KEYS).toContain('hero_color')
        expect(TRACKING_COLOR_KEYS).toContain('stamp_color')
    })
})
