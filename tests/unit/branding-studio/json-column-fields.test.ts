import { createJsonColumnFields } from '@/lib/branding-studio/json-column-fields'

const labels = createJsonColumnFields('storefront_labels', ['cart.title', 'cart.empty'])

describe('json column fields', () => {
    it('flattens saved known keys into field ids', () => {
        expect(labels.flatten({ storefront_labels: { 'cart.title': 'Tray', bogus: 'x', 'cart.empty': '' } })).toEqual({ 'storefront_labels.cart.title': 'Tray' })
    })

    it('folds draft edits over saved values; a cleared field is removed', () => {
        const folded = labels.fold(
            { 'storefront_labels.cart.title': '', 'storefront_labels.cart.empty': 'Wala pa', unrelated: 1 },
            { storefront_labels: { 'cart.title': 'Tray' } },
        )

        expect(folded).toEqual({ 'cart.empty': 'Wala pa' })
    })

    it('streams the whole column to the preview only when its fields were edited', () => {
        const draft = { accent_color: '#000000' }
        expect(labels.withPreview(draft, {})).toBe(draft)
        expect(labels.withPreview({ 'storefront_labels.cart.title': 'Tray' }, {})).toEqual({ 'storefront_labels.cart.title': 'Tray', storefront_labels: { 'cart.title': 'Tray' } })
    })
})
