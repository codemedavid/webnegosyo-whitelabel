/**
 * Tap-to-edit components (brand editor v2, Phase 2). Each scope the
 * storefront tags (`data-branding-scope`, see branding-inspect.ts) is a
 * component: a label, a parent, and only the settings that change it.
 *
 * - A section scope (no fieldId) owns its whole settings section.
 * - An element scope owns the field group its anchor field belongs to
 *   (`variation_option_background_color` → every `variation_option_*` field),
 *   and sits under its section's scope.
 *
 * Pure and derived from the registries, so a renamed section or a new field
 * shows up here without a second list to keep in sync.
 */

import { BRANDING_SCOPE_MAP, type BrandingScopeTarget } from '@/lib/branding-inspect'
import { BRANDING_SURFACES, type BrandingSection, type BrandingSurface } from '@/lib/branding-registry'
import { PRODUCT_SURFACE_SECTIONS } from '@/lib/branding-studio/product-surface'

export interface BrandingComponent {
    /** The scope key (`product/add-to-cart`). */
    id: string
    label: string
    surfaceId: BrandingSurface['id']
    sectionTitle: string
    /** The section component this element sits under; null for a section. */
    parent: string | null
    /** Settings that change this component, in panel order. */
    fieldIds: string[]
}

// Words that name what a field paints, not which thing it belongs to.
const PROPERTY_WORDS = new Set(['color', 'background', 'text', 'border', 'size', 'font', 'weight', 'shape', 'label'])

/** `variation_option_background_color` → `variation_option`. */
function fieldGroup(fieldId: string): string {
    const words = fieldId.split('_')
    while (words.length > 1 && PROPERTY_WORDS.has(words[words.length - 1])) words.pop()
    return words.join('_')
}

// Elements whose settings aren't one name group (checked against the section).
const ELEMENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
    'storefront/header-title': ['header_font_color', 'header_show_name'],
    'storefront/header-logo': ['header_logo_shape', 'header_show_logo'],
    'product/variation-option': [
        'variation_option_background_color', 'variation_option_text_color', 'variation_option_border_color',
        'variation_option_selected_background_color', 'variation_option_selected_text_color',
        'variation_option_selected_border_color', 'variation_price_modifier_color',
    ],
    'product/addon-option': [
        'addon_background_color', 'addon_text_color', 'addon_border_color',
        'addon_selected_background_color', 'addon_selected_text_color', 'addon_selected_border_color',
        'addon_selected_check_color', 'addon_price_color', 'addon_price_free_text',
    ],
    'product/quantity': ['quantity_controls_background', 'quantity_button_color', 'quantity_text_color'],
    'cart/item': ['cart_card_background_color', 'cart_text_color', 'cart_muted_text_color', 'cart_border_color'],
    'cart/item-price': ['cart_accent_color'],
    'cart/summary': ['cart_summary_background_color', 'cart_text_color', 'cart_muted_text_color'],
    'cart/checkout-button': ['cart_button_color', 'cart_button_text_color'],
    'checkout/card': ['checkout_card_background_color', 'checkout_text_color', 'checkout_muted_text_color', 'checkout_border_color'],
    'checkout/summary': ['checkout_summary_background_color', 'checkout_text_color', 'checkout_muted_text_color'],
    'checkout/choice': ['checkout_accent_color', 'checkout_border_color'],
    'checkout/place-order': ['checkout_button_color', 'checkout_button_text_color'],
}

function sectionsFor(surfaceId: BrandingSurface['id']): readonly BrandingSection[] {
    if (surfaceId === 'product') return PRODUCT_SURFACE_SECTIONS
    return BRANDING_SURFACES.find((surface) => surface.id === surfaceId)?.sections ?? []
}

function sectionFieldIds(target: BrandingScopeTarget): string[] {
    const section = sectionsFor(target.surfaceId).find((candidate) => candidate.title === target.sectionTitle)
    return (section?.fields ?? []).filter((field) => field.type !== 'note').map((field) => field.id)
}

function sectionScopeFor(target: BrandingScopeTarget): string | null {
    const entry = Object.entries(BRANDING_SCOPE_MAP).find(
        ([, candidate]) => !candidate.fieldId && candidate.surfaceId === target.surfaceId && candidate.sectionTitle === target.sectionTitle
    )
    return entry?.[0] ?? null
}

function toComponent(scope: string, target: BrandingScopeTarget): BrandingComponent {
    const fieldsInSection = sectionFieldIds(target)
    if (!target.fieldId) {
        return { id: scope, label: target.label, surfaceId: target.surfaceId, sectionTitle: target.sectionTitle, parent: null, fieldIds: fieldsInSection }
    }
    const group = fieldGroup(target.fieldId)
    const explicit = ELEMENT_FIELDS[scope]
    const grouped = explicit
        ? fieldsInSection.filter((fieldId) => explicit.includes(fieldId))
        : fieldsInSection.filter((fieldId) => fieldId === target.fieldId || fieldId.startsWith(`${group}_`) || fieldId === group)
    return {
        id: scope,
        label: target.label,
        surfaceId: target.surfaceId,
        sectionTitle: target.sectionTitle,
        parent: sectionScopeFor(target),
        fieldIds: grouped.length > 0 ? grouped : [target.fieldId],
    }
}

export const BRANDING_COMPONENTS: Readonly<Record<string, BrandingComponent>> = Object.freeze(
    Object.fromEntries(Object.entries(BRANDING_SCOPE_MAP).map(([scope, target]) => [scope, toComponent(scope, target)]))
)

/** The component for an (untrusted) scope key, or null. */
export function getBrandingComponent(scope: unknown): BrandingComponent | null {
    if (typeof scope !== 'string' || !Object.prototype.hasOwnProperty.call(BRANDING_COMPONENTS, scope)) return null
    return BRANDING_COMPONENTS[scope]
}

export interface ComponentCrumb {
    label: string
    /** Scope to select when the crumb is tapped; null for the screen itself. */
    scope: string | null
}

/** Screen › section › element. Empty for an unknown scope. */
export function componentBreadcrumb(scope: string): ComponentCrumb[] {
    const component = getBrandingComponent(scope)
    if (!component) return []
    const surfaceLabel = BRANDING_SURFACES.find((surface) => surface.id === component.surfaceId)?.label ?? component.surfaceId
    const parent = component.parent ? getBrandingComponent(component.parent) : null
    const sectionCrumb: ComponentCrumb = parent
        ? { label: parent.sectionTitle, scope: parent.id }
        : { label: component.sectionTitle, scope: component.id }
    const crumbs: ComponentCrumb[] = [{ label: surfaceLabel, scope: null }, sectionCrumb]
    return parent ? [...crumbs, { label: component.label, scope: component.id }] : crumbs
}

/**
 * The parts of the page a setting changes: the elements that own it, or — when
 * no single element does — the sections that do. (A section owns every field
 * in it, so listing both would outline the whole section around each chip.)
 */
export function componentsUsingField(surfaceId: BrandingSurface['id'], fieldId: string): string[] {
    const owners = Object.values(BRANDING_COMPONENTS)
        .filter((component) => component.surfaceId === surfaceId && component.fieldIds.includes(fieldId))
    const elements = owners.filter((component) => component.parent !== null)
    return (elements.length > 0 ? elements : owners).map((component) => component.id)
}

export interface ComponentTreeNode {
    component: BrandingComponent
    children: BrandingComponent[]
}

/**
 * Every tappable part of a screen as a two-level tree (section › element),
 * in registry order — the keyboard / screen-reader way to pick a part.
 */
export function componentTree(surfaceId: BrandingSurface['id']): ComponentTreeNode[] {
    const onSurface = Object.values(BRANDING_COMPONENTS).filter((component) => component.surfaceId === surfaceId)
    const isListedUnderParent = (component: BrandingComponent) =>
        component.parent !== null && onSurface.some((candidate) => candidate.id === component.parent)
    return onSurface
        .filter((component) => !isListedUnderParent(component))
        .map((component) => ({ component, children: onSurface.filter((child) => child.parent === component.id) }))
}
