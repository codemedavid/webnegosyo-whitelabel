import { contrastRatio, readableTextOn } from '@/lib/color-contrast'

describe('contrastRatio', () => {
    it('is 21 for black on white', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    })

    it('is 1 for a colour on itself', () => {
        expect(contrastRatio('#e8b83f', '#e8b83f')).toBeCloseTo(1, 5)
    })

    it('accepts 3-digit hex', () => {
        expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1)
    })

    it('is null when either colour is not measurable', () => {
        expect(contrastRatio('rgba(0,0,0,0.5)', '#ffffff')).toBeNull()
        expect(contrastRatio('#ffffff', 'transparent')).toBeNull()
    })
})

describe('readableTextOn', () => {
    it('keeps text that is already readable', () => {
        expect(readableTextOn('#fafafa', '#1a1a1a')).toBe('#fafafa')
    })

    it('makes unreadable light text on white readable', () => {
        const fixed = readableTextOn('#fafafa', '#ffffff')

        expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('makes unreadable dark text on a dark fill readable', () => {
        const fixed = readableTextOn('#374151', '#1a1a1a')

        expect(contrastRatio(fixed, '#1a1a1a')).toBeGreaterThanOrEqual(4.5)
    })

    it('nudges only as far as needed, keeping the colour\'s character', () => {
        // A muted grey breadcrumb on white becomes a darker grey, not black.
        const fixed = readableTextOn('#9ca3af', '#ffffff')

        expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(fixed).not.toBe('#111111')
        expect(contrastRatio(fixed, '#ffffff')).toBeLessThan(7)
    })

    it('leaves colours it cannot measure alone', () => {
        expect(readableTextOn('#374151', 'transparent')).toBe('#374151')
        expect(readableTextOn('currentColor', '#ffffff')).toBe('currentColor')
    })

    it('uses the given minimum ratio', () => {
        // #777777 on white is about 4.48:1 — fine for large text (3), not body (4.5)
        expect(readableTextOn('#777777', '#ffffff', 3)).toBe('#777777')
        expect(contrastRatio(readableTextOn('#777777', '#ffffff', 4.5), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })
})
