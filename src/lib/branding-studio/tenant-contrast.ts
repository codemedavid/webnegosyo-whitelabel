/**
 * Store-wide text that is hard to read on the colour behind it (brand editor
 * v2, Phase 3). Colours are resolved the way the storefront does
 * (getTenantBranding for store colours, the registry's inherit chains for the
 * rest), so an inherited colour is flagged too: that is exactly the case an
 * owner can't explain ("I never changed the text — why is it gone?").
 */

import { BRANDING_FIELD_INDEX, BRANDING_SURFACES, resolveFieldValue } from '@/lib/branding-registry'
import { contrastRatio, MIN_TEXT_CONTRAST, readableTextOn } from '@/lib/color-contrast'
import { createTenantColorResolver } from '@/lib/branding-studio/tenant-field-effective'

type Bag = Record<string, unknown> | null | undefined

/** WCAG minimum for large text, prices and icons. */
const LARGE_TEXT_CONTRAST = 3

interface TenantPair {
    text: string
    fill: string
    minRatio: number
    /**
     * Cart and checkout read their own columns raw — a blank one is the
     * template's own look (white cards, auto-contrast button ink), not an
     * inherited store colour. For these: only check text the owner set, and
     * measure it against the owner's fill or the template's.
     */
    pageColumns?: { fillWhenBlank: 'white' | 'cartAccent' | 'checkoutAccent' }
    /** Only meaningful while the fill column is set (e.g. the hero band). */
    onlyWhenFillSet?: boolean
}

export const TENANT_READABLE_PAIRS: readonly TenantPair[] = [
    { text: 'text_primary_color', fill: 'background_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'header_font_color', fill: 'header_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'button_primary_text_color', fill: 'button_primary_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'button_secondary_text_color', fill: 'button_secondary_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'card_title_color', fill: 'cards_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'card_description_color', fill: 'cards_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'card_price_color', fill: 'cards_color', minRatio: LARGE_TEXT_CONTRAST },
    { text: 'menu_cart_badge_text_color', fill: 'menu_cart_badge_background_color', minRatio: LARGE_TEXT_CONTRAST },
    { text: 'modal_title_color', fill: 'modal_background_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'modal_description_color', fill: 'modal_background_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'hero_title_color', fill: 'hero_background_color', minRatio: LARGE_TEXT_CONTRAST, onlyWhenFillSet: true },
    { text: 'hero_description_color', fill: 'hero_background_color', minRatio: MIN_TEXT_CONTRAST, onlyWhenFillSet: true },
    { text: 'cart_text_color', fill: 'cart_card_background_color', minRatio: MIN_TEXT_CONTRAST, pageColumns: { fillWhenBlank: 'white' } },
    { text: 'cart_button_text_color', fill: 'cart_button_color', minRatio: MIN_TEXT_CONTRAST, pageColumns: { fillWhenBlank: 'cartAccent' } },
    { text: 'checkout_text_color', fill: 'checkout_card_background_color', minRatio: MIN_TEXT_CONTRAST, pageColumns: { fillWhenBlank: 'white' } },
    { text: 'checkout_button_text_color', fill: 'checkout_button_color', minRatio: MIN_TEXT_CONTRAST, pageColumns: { fillWhenBlank: 'checkoutAccent' } },
    { text: 'checkout_modal_title_color', fill: 'checkout_modal_background_color', minRatio: MIN_TEXT_CONTRAST },
    { text: 'checkout_modal_button_text_color', fill: 'checkout_modal_button_color', minRatio: MIN_TEXT_CONTRAST },
]

// Card designs that don't paint the cards colour behind their text.
const CARD_TEMPLATES_WITH_OWN_FILL = new Set(['neon', 'glass'])
const CARD_TEXT_FIELDS = new Set(['card_title_color', 'card_description_color', 'card_price_color'])
// Heroes that ignore the hero colour columns.
const HEROES_WITHOUT_COLOR_COLUMNS = new Set(['custom', 'legacy'])
const WHITE = '#ffffff'

export interface TenantContrastIssue {
    fieldId: string
    label: string
    ratio: number
    minRatio: number
    /** The readable ink the text field can switch to. */
    fix: string
}

interface ColorLookup {
    /** What the storefront paints with (store resolver, then the registry chain). */
    resolved: (fieldId: string) => string | undefined
    /** The owner's own value, or undefined when blank. */
    raw: (fieldId: string) => string | undefined
    accent: (key: 'cartAccent' | 'checkoutAccent') => string | undefined
}

function createColorLookup(draft: Bag, saved: Bag): ColorLookup {
    const storeColor = createTenantColorResolver(draft, saved)
    const merged = { ...(saved ?? {}), ...(draft ?? {}) }
    const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
    return {
        resolved: (fieldId) => clean(storeColor(fieldId) ?? resolveFieldValue(fieldId, draft, saved)),
        raw: (fieldId) => clean(merged[fieldId]),
        accent: (key) => clean(storeColor(key === 'cartAccent' ? 'cart_accent_color' : 'checkout_accent_color')),
    }
}

function isPairShown(pair: TenantPair, colors: ColorLookup): boolean {
    if (CARD_TEXT_FIELDS.has(pair.text) && CARD_TEMPLATES_WITH_OWN_FILL.has(colors.raw('card_template') ?? '')) return false
    if (pair.onlyWhenFillSet) {
        return Boolean(colors.raw(pair.fill)) && !HEROES_WITHOUT_COLOR_COLUMNS.has(colors.raw('hero_preset') ?? '')
    }
    return true
}

function pairColors(pair: TenantPair, colors: ColorLookup): { text?: string; fill?: string } {
    if (!pair.pageColumns) return { text: colors.resolved(pair.text), fill: colors.resolved(pair.fill) }
    const { fillWhenBlank } = pair.pageColumns
    return {
        text: colors.raw(pair.text),
        fill: colors.raw(pair.fill) ?? (fillWhenBlank === 'white' ? WHITE : colors.accent(fillWhenBlank)),
    }
}

/** "Cart · Text" — field labels repeat across screens, so name the screen too. */
function labelFor(fieldId: string): string {
    const fieldLabel = BRANDING_FIELD_INDEX[fieldId]?.label ?? fieldId
    const surface = BRANDING_SURFACES.find((candidate) =>
        candidate.sections.some((section) => section.fields.some((field) => field.id === fieldId))
    )
    return surface && surface.id !== 'global' ? `${surface.label} · ${fieldLabel}` : fieldLabel
}

function issueFor(pair: TenantPair, colors: ColorLookup): TenantContrastIssue | null {
    if (!isPairShown(pair, colors)) return null
    const { text, fill } = pairColors(pair, colors)
    if (!text || !fill) return null
    const ratio = contrastRatio(text, fill)
    if (ratio === null || ratio >= pair.minRatio) return null
    return {
        fieldId: pair.text,
        label: labelFor(pair.text),
        ratio,
        minRatio: pair.minRatio,
        fix: readableTextOn(text, fill, pair.minRatio),
    }
}

/** The contrast problem on this text field, or null. */
export function tenantContrastIssue(fieldId: string, draft: Bag, saved: Bag): TenantContrastIssue | null {
    const pair = TENANT_READABLE_PAIRS.find((candidate) => candidate.text === fieldId)
    return pair ? issueFor(pair, createColorLookup(draft, saved)) : null
}

/** Every unreadable pair in the store (Global Brand's "N things are hard to read"). */
export function listTenantContrastIssues(draft: Bag, saved: Bag): TenantContrastIssue[] {
    const colors = createColorLookup(draft, saved)
    return TENANT_READABLE_PAIRS.flatMap((pair) => {
        const issue = issueFor(pair, colors)
        return issue ? [issue] : []
    })
}
