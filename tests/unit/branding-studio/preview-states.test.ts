/**
 * Item-page settings that only show on some dishes (sale price, dietary tags,
 * "You might also like", photo viewer, after-adding sheet, option prices…)
 * get a sample in the Studio preview, so every setting visibly does something
 * whatever dish is previewed (owner, 2026-10-18: "some are still not editable").
 */

import { applyPreviewStates, PRODUCT_PREVIEW_STATES, previewStatesForField } from '@/lib/branding-studio/preview-states'
import { PRODUCT_DETAIL_SECTIONS } from '@/lib/product-detail-registry'
import type { MenuItem } from '@/types/database'

const DISH = {
    id: 'dish',
    name: 'Java Chip',
    price: 100,
    image_url: 'https://img/java.jpg',
    variations: [],
    variation_types: [{ id: 't', name: 'Size', is_required: true, options: [{ id: 'a', name: 'Medium', price_modifier: 0 }, { id: 'b', name: 'Large', price_modifier: 0 }] }],
    modifier_groups: [{ id: 'g', name: 'Sugar', min_select: 1, max_select: 1, display_order: 0, options: [{ id: 'x', name: 'Full', price_modifier: 0, display_order: 0 }, { id: 'y', name: 'Less', price_modifier: 0, display_order: 1 }] }],
    addons: [{ id: 'p', name: 'Pearl', price: 10 }],
} as unknown as MenuItem

describe('applyPreviewStates', () => {
    it('leaves the dish alone without states', () => {
        expect(applyPreviewStates(DISH, [])).toBe(DISH)
    })

    it('puts the dish on sale', () => {
        expect(applyPreviewStates(DISH, ['sale']).discounted_price).toBe(80)
    })

    it('keeps a real sale price', () => {
        expect(applyPreviewStates({ ...DISH, discounted_price: 90 } as MenuItem, ['sale']).discounted_price).toBe(90)
    })

    it('hides the photo', () => {
        expect(applyPreviewStates(DISH, ['no-photo']).image_url).toBe('')
    })

    it('gives options a price difference and one add-on a free price', () => {
        const dish = applyPreviewStates(DISH, ['prices'])

        expect(dish.variation_types?.[0].options.map((option) => option.price_modifier)).toEqual([0, 10])
        expect(dish.modifier_groups?.[0].options.map((option) => option.price_modifier)).toEqual([0, 10])
        expect(dish.addons[0].price).toBe(0)
    })

    it('makes the last choice group optional and pick-any', () => {
        const dish = applyPreviewStates(DISH, ['optional'])

        expect(dish.variation_types?.[0].is_required).toBe(false)
        expect(dish.modifier_groups?.[0]).toMatchObject({ min_select: 0, max_select: null })
    })

    it('shows a dish without options', () => {
        const dish = applyPreviewStates(DISH, ['no-options'])

        expect([dish.variation_types, dish.modifier_groups, dish.addons]).toEqual([[], [], []])
    })

    it('adds sample add-ons in the form the dish uses', () => {
        const groupDish = applyPreviewStates(DISH, ['addons'])
        expect(groupDish.modifier_groups?.at(-1)).toMatchObject({ selection_mode: 'quantity', min_select: 0 })

        const legacyDish = applyPreviewStates({ ...DISH, modifier_groups: [], addons: [] } as unknown as MenuItem, ['addons'])
        expect(legacyDish.addons.length).toBeGreaterThan(0)
    })

    it('leaves real add-ons alone', () => {
        const legacy = { ...DISH, modifier_groups: [] } as unknown as MenuItem

        expect(applyPreviewStates(legacy, ['addons']).addons).toBe(legacy.addons)
    })

    it('does not change the original dish', () => {
        applyPreviewStates(DISH, ['prices', 'sale', 'no-photo'])

        expect(DISH.addons[0].price).toBe(10)
        expect(DISH.image_url).toBe('https://img/java.jpg')
    })
})

describe('previewStatesForField', () => {
    it('shows the sale badge while its colours are edited', () => {
        expect(previewStatesForField('sale_badge_background_color')).toEqual(['sale'])
        expect(previewStatesForField('original_price_color')).toEqual(['sale'])
    })

    it('opens the photo viewer for its colours', () => {
        expect(previewStatesForField('modal_background_color')).toEqual(['lightbox'])
    })

    it('shows sample add-ons for add-on settings', () => {
        expect(previewStatesForField('addon_background_color')).toEqual(['addons'])
    })

    it('needs nothing for always-visible settings', () => {
        expect(previewStatesForField('product_name_color')).toEqual([])
    })

    it('only names states that exist', () => {
        const known = new Set(PRODUCT_PREVIEW_STATES.map((state) => state.id))
        const fieldIds = PRODUCT_DETAIL_SECTIONS.flatMap((section) => section.fields.map((field) => field.id))

        for (const fieldId of fieldIds) {
            for (const state of previewStatesForField(fieldId)) expect(known.has(state)).toBe(true)
        }
    })
})
