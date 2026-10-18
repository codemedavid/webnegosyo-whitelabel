/**
 * Store-wide colours that are hard to read get flagged in the Studio with a
 * one-tap Fix, and Global Brand counts every such pair across the store.
 */

import { contrastRatio } from '@/lib/color-contrast'
import { listTenantContrastIssues, tenantContrastIssue } from '@/lib/branding-studio/tenant-contrast'

const DARK = { background_color: '#171717', cards_color: '#1a1a1a', text_primary_color: '#fafafa', header_color: '#111111' }

describe('tenantContrastIssue', () => {
    it('flags header text the same colour as the header', () => {
        const issue = tenantContrastIssue('header_font_color', { header_font_color: '#121212' }, DARK)

        expect(contrastRatio(issue!.fix, '#111111')).toBeGreaterThanOrEqual(4.5)
        expect(issue?.ratio).toBeLessThan(1.1)
    })

    it('flags an inherited colour too — the owner sees why the text vanished', () => {
        const issue = tenantContrastIssue('card_title_color', { cards_color: '#fefefe' }, { ...DARK, text_primary_color: '#ffffff' })

        expect(issue).not.toBeNull()
    })

    it('says nothing when the pair reads', () => {
        expect(tenantContrastIssue('header_font_color', { header_font_color: '#ffffff' }, DARK)).toBeNull()
    })

    it('says nothing for fields that are not text on a fill', () => {
        expect(tenantContrastIssue('cards_color', {}, DARK)).toBeNull()
    })
})

describe('listTenantContrastIssues', () => {
    it('lists every unreadable pair in the store', () => {
        const issues = listTenantContrastIssues({ header_font_color: '#121212', button_primary_color: '#ffffff', button_primary_text_color: '#fefefe' }, DARK)

        expect(issues.map((issue) => issue.fieldId)).toEqual(expect.arrayContaining(['header_font_color', 'button_primary_text_color']))
        expect(issues.every((issue) => issue.label.length > 0)).toBe(true)
    })

    it('is empty for a store on the standard colours', () => {
        expect(listTenantContrastIssues({}, {})).toEqual([])
    })

    it('catches a dark store whose prices kept the dark default', () => {
        // Only page, cards and text were changed: prices still use the near-black main colour.
        const fieldIds = listTenantContrastIssues({}, DARK).map((issue) => issue.fieldId)

        expect(fieldIds).toContain('card_price_color')
    })
})

describe('issue labels', () => {
    it('names the screen, since labels repeat', () => {
        const issue = tenantContrastIssue('cart_text_color', { cart_text_color: '#000000', cart_card_background_color: '#111111' }, {})

        expect(issue?.label).toBe('Cart · Text')
    })
})

describe('only what the storefront really draws', () => {
    it('measures cart text on the white template card when the card colour is blank', () => {
        // Dark store cards don't reach the cart: blank cart columns keep the template's white.
        expect(tenantContrastIssue('cart_text_color', { cart_text_color: '#000000' }, { cards_color: '#171717' })).toBeNull()
    })

    it('leaves blank cart button text alone — the cart prints readable ink itself', () => {
        expect(tenantContrastIssue('cart_button_text_color', {}, { button_primary_text_color: '#ffffff', cart_button_color: '#fff6d9' })).toBeNull()
    })

    it('flags cart button text the owner set on the cart accent', () => {
        expect(tenantContrastIssue('cart_button_text_color', { cart_button_text_color: '#ffffff' }, { button_primary_color: '#e8b83f' })).not.toBeNull()
    })

    it('skips card text on designs that paint their own card', () => {
        const saved = { cards_color: '#ffffff', card_title_color: '#fefefe', card_template: 'neon' }

        expect(tenantContrastIssue('card_title_color', {}, saved)).toBeNull()
    })

    it('checks hero text only on a coloured hero band', () => {
        expect(tenantContrastIssue('hero_title_color', { hero_title_color: '#ffffff' }, {})).toBeNull()
        expect(tenantContrastIssue('hero_title_color', { hero_title_color: '#ffffff', hero_background_color: '#fefefe' }, {})).not.toBeNull()
        expect(tenantContrastIssue('hero_title_color', { hero_title_color: '#ffffff', hero_background_color: '#fefefe', hero_preset: 'custom' }, {})).toBeNull()
    })
})
