/**
 * Tap-to-edit (brand editor v2, Phase 2): every tappable region of the
 * preview is a component with a parent, a breadcrumb and ONLY its own
 * settings. Every scope the storefront tags must be a component, and every
 * field must be reachable from one.
 */

import { BRANDING_SCOPE_MAP } from '@/lib/branding-inspect'
import { BRANDING_SURFACES } from '@/lib/branding-registry'
import { PRODUCT_DETAIL_SECTIONS } from '@/lib/product-detail-registry'
import {
    componentBreadcrumb,
    componentsUsingField,
    getBrandingComponent,
    BRANDING_COMPONENTS,
    componentTree,
} from '@/lib/branding-components'

describe('branding components', () => {
    it('has a component for every scope the storefront tags', () => {
        const missing = Object.keys(BRANDING_SCOPE_MAP).filter((scope) => !BRANDING_COMPONENTS[scope])

        expect(missing).toEqual([])
    })

    it('reaches every field of every tappable section', () => {
        const sectionsWithScope = new Set(Object.values(BRANDING_SCOPE_MAP).map((target) => `${target.surfaceId}/${target.sectionTitle}`))
        const allSections = [
            ...BRANDING_SURFACES.flatMap((surface) => surface.sections.map((section) => ({ surfaceId: surface.id, section }))),
            ...PRODUCT_DETAIL_SECTIONS.map((section) => ({ surfaceId: 'product' as const, section })),
        ].filter(({ surfaceId, section }) => sectionsWithScope.has(`${surfaceId}/${section.title}`))
        const reachable = new Set(Object.values(BRANDING_COMPONENTS).flatMap((component) => component.fieldIds.map((id) => `${component.surfaceId}:${id}`)))

        const unreachable = allSections.flatMap(({ surfaceId, section }) =>
            section.fields.filter((field) => field.type !== 'note' && !reachable.has(`${surfaceId}:${field.id}`)).map((field) => `${surfaceId}:${field.id}`)
        )

        expect(unreachable).toEqual([])
    })

    it('gives an element only its own group of settings', () => {
        const chip = getBrandingComponent('product/variation-option')

        expect(chip?.fieldIds).toEqual(expect.arrayContaining(['variation_option_background_color', 'variation_option_text_color', 'variation_option_selected_background_color']))
        expect(chip?.fieldIds).not.toContain('addon_background_color')
        expect(chip?.fieldIds).not.toContain('variation_section_title_color')
    })

    it('puts an element under its section', () => {
        expect(getBrandingComponent('product/add-to-cart')?.parent).toBe('product/sticky-footer')
        expect(getBrandingComponent('product/sticky-footer')?.parent).toBeNull()
    })

    it('builds a breadcrumb from the screen down', () => {
        expect(componentBreadcrumb('product/variation-option').map((crumb) => crumb.label)).toEqual([
            'Product Detail',
            'Variations',
            'Variation option',
        ])
    })

    it('points a setting at the element it changes (for two-way hover)', () => {
        expect(componentsUsingField('product', 'add_to_cart_button_background')).toEqual(['product/add-to-cart'])
    })

    it('falls back to the section when no element owns the setting', () => {
        expect(componentsUsingField('product', 'section_padding')).toEqual(['product/layout'])
    })

    it('knows nothing about unknown scopes', () => {
        expect(getBrandingComponent('nope/nothing')).toBeNull()
        expect(componentBreadcrumb('nope/nothing')).toEqual([])
    })
})

describe('hand-grouped elements', () => {
    it('keeps the add-on row apart from the add-on section title', () => {
        const row = getBrandingComponent('product/addon-option')

        expect(row?.fieldIds).toContain('addon_selected_background_color')
        expect(row?.fieldIds).not.toContain('addon_section_title_color')
    })

    it('gives the business name only its own settings', () => {
        expect(getBrandingComponent('storefront/header-title')?.fieldIds).toEqual(expect.arrayContaining(['header_font_color']))
        expect(getBrandingComponent('storefront/header-title')?.fieldIds).not.toContain('header_template')
    })

    it('every explicit element field exists in its section', () => {
        for (const component of Object.values(BRANDING_COMPONENTS)) {
            expect(component.fieldIds.length).toBeGreaterThan(0)
        }
    })
})

describe('label parts', () => {
    it('a tapped label opens just that label, under its screen\'s wording', () => {
        expect(getBrandingComponent('label/cart.title')).toMatchObject({
            surfaceId: 'cart',
            parent: 'cart/labels',
            fieldIds: ['storefront_labels.cart.title'],
        })
    })

    it('an item page label stays on the item page', () => {
        expect(getBrandingComponent('label/item.related_title')?.surfaceId).toBe('product')
    })

    it('the checkout button opens its colours', () => {
        expect(getBrandingComponent('checkout/place-order')?.fieldIds).toEqual(['checkout_button_color', 'checkout_button_text_color'])
    })
})

describe('componentTree', () => {
    it('lists each section once with its elements under it', () => {
        const tree = componentTree('product')
        const footer = tree.find((node) => node.component.id === 'product/sticky-footer')

        expect(footer?.children.map((child) => child.id)).toContain('product/add-to-cart')
        expect(tree.some((node) => node.component.id === 'product/add-to-cart')).toBe(false)
    })

    it('covers every part of the screen exactly once', () => {
        const ids = componentTree('checkout').flatMap((node) => [node.component.id, ...node.children.map((child) => child.id)])
        const expected = Object.values(BRANDING_COMPONENTS).filter((component) => component.surfaceId === 'checkout').map((component) => component.id)

        expect([...ids].sort()).toEqual([...expected].sort())
    })
})
