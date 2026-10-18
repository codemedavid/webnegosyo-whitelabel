/**
 * Samples for item-page parts that only some dishes have, shown ONLY in the
 * Branding Studio preview: a sale price, dietary tags, no photo, "You might
 * also like", the photo viewer, the after-adding sheet, option prices.
 * Without them, settings for those parts change nothing the owner can see.
 */

import type { MenuItem } from '@/types/database'

export type ProductPreviewState = 'sale' | 'dietary' | 'no-photo' | 'related' | 'lightbox' | 'added' | 'prices' | 'optional' | 'no-options' | 'addons'

export const PRODUCT_PREVIEW_STATES: ReadonlyArray<{ id: ProductPreviewState; label: string }> = [
    { id: 'sale', label: 'Sale price' },
    { id: 'prices', label: 'Option prices' },
    { id: 'addons', label: 'Add-ons' },
    { id: 'optional', label: 'Optional choices' },
    { id: 'no-options', label: 'No options' },
    { id: 'dietary', label: 'Dietary tags' },
    { id: 'no-photo', label: 'No photo' },
    { id: 'related', label: 'You might also like' },
    { id: 'lightbox', label: 'Photo viewer' },
    { id: 'added', label: 'After adding' },
]

/** Draft meta key the Studio streams the chosen states under. */
export const PREVIEW_STATES_KEY = '__previewStates'

const SAMPLE_DISCOUNT = 0.8
const SAMPLE_PRICE_DELTA = 10

const FIELD_STATES: ReadonlyArray<[RegExp, ProductPreviewState]> = [
    [/^sale_badge_|^original_price_color$/, 'sale'],
    [/^dietary_tag_/, 'dietary'],
    [/^addon_(?!selected_check)/, 'addons'],
    [/^image_placeholder_color$/, 'no-photo'],
    [/^related_/, 'related'],
    [/^modal_/, 'lightbox'],
    [/^popup_modal_/, 'added'],
    [/^variation_price_modifier_color$|^addon_price_free_text$/, 'prices'],
    [/^variation_optional_text$|^addon_selected_check_color$/, 'optional'],
    [/^footer_empty_summary_text$/, 'no-options'],
    // Card radius rounds the add-on rows and the "You might also like" cards.
    [/^card_border_radius$/, 'addons'],
    [/^card_border_radius$/, 'related'],
]

/** The samples a setting needs to be visible in the preview. */
export function previewStatesForField(fieldId: string): ProductPreviewState[] {
    return FIELD_STATES.filter(([pattern]) => pattern.test(fieldId)).map(([, state]) => state)
}

/** Untrusted draft meta → the states the preview understands. */
export function parsePreviewStates(value: unknown): Set<ProductPreviewState> {
    const known = new Set<string>(PRODUCT_PREVIEW_STATES.map((state) => state.id))
    return new Set(Array.isArray(value) ? value.filter((state): state is ProductPreviewState => typeof state === 'string' && known.has(state)) : [])
}

function withSamplePrices<T extends { price_modifier: number }>(options: readonly T[]): T[] {
    return options.map((option, index) =>
        index > 0 && option.price_modifier === 0 ? { ...option, price_modifier: SAMPLE_PRICE_DELTA } : option
    )
}

/** A preview copy of the dish with the chosen samples; the dish itself is untouched. */
export function applyPreviewStates(item: MenuItem, states: Iterable<ProductPreviewState>): MenuItem {
    const chosen = new Set(states)
    if (chosen.size === 0) return item
    let next: MenuItem = item
    if (chosen.has('sale') && !(item.discounted_price && item.discounted_price < item.price)) {
        next = { ...next, discounted_price: Math.round(item.price * SAMPLE_DISCOUNT) }
    }
    if (chosen.has('no-photo')) next = { ...next, image_url: '' }
    if (chosen.has('prices')) {
        next = {
            ...next,
            variation_types: next.variation_types?.map((type) => ({ ...type, options: withSamplePrices(type.options) })),
            modifier_groups: next.modifier_groups?.map((group) => ({ ...group, options: withSamplePrices(group.options) })),
            variations: withSamplePrices(next.variations ?? []),
            addons: (next.addons ?? []).map((addon, index) => (index === 0 ? { ...addon, price: 0 } : addon)),
        }
    }
    if (chosen.has('addons')) next = withSampleAddons(next)
    if (chosen.has('optional')) next = withOptionalLastGroup(next)
    if (chosen.has('no-options')) {
        next = { ...next, variation_types: [], modifier_groups: [], variations: [], addons: [] }
    }
    return next
}

const SAMPLE_ADDONS = [
    { id: 'sample-addon-1', name: 'Extra shot', price: 20 },
    { id: 'sample-addon-2', name: 'Whipped cream', price: 0 },
]

/** Sample add-ons for a dish without any, in whichever form the dish uses. */
function withSampleAddons(item: MenuItem): MenuItem {
    const groups = item.modifier_groups ?? []
    if (groups.length > 0) {
        if (groups.some((group) => group.selection_mode === 'quantity')) return item
        const sampleGroup = {
            id: 'sample-addons',
            name: 'Add-ons',
            display_order: groups.length,
            min_select: 0,
            max_select: null,
            selection_mode: 'quantity' as const,
            options: SAMPLE_ADDONS.map((addon, index) => ({ id: addon.id, name: addon.name, price_modifier: addon.price, display_order: index })),
        }
        return { ...item, modifier_groups: [...groups, sampleGroup] as MenuItem['modifier_groups'] }
    }
    if ((item.addons ?? []).length > 0) return item
    return { ...item, addons: SAMPLE_ADDONS as unknown as MenuItem['addons'] }
}

/** The last choice group becomes optional (and pick-any), showing the optional label and the ✓ boxes. */
function withOptionalLastGroup(item: MenuItem): MenuItem {
    const types = item.variation_types ?? []
    const groups = item.modifier_groups ?? []
    return {
        ...item,
        variation_types: types.map((type, index) => (index === types.length - 1 ? { ...type, is_required: false } : type)),
        modifier_groups: groups.map((group, index) =>
            index === groups.length - 1 && group.selection_mode !== 'quantity' ? { ...group, min_select: 0, max_select: null } : group
        ),
    }
}
