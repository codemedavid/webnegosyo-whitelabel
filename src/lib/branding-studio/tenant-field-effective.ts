/**
 * What the storefront renders for a store-wide colour field, worked out by the
 * storefront's own resolver (getTenantBranding: palette, legacy brand_color,
 * modal → cards → palette fallbacks), so the Studio never shows a colour the
 * store doesn't use.
 */

import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'

type Bag = Record<string, unknown> | null | undefined

/** Tenant colour columns → the resolved colour the storefront paints with. */
export const TENANT_COLOR_KEYS: Readonly<Record<string, keyof BrandingColors>> = {
    background_color: 'background',
    header_color: 'header',
    header_font_color: 'headerFont',
    cards_color: 'cards',
    cards_border_color: 'cardsBorder',
    card_title_color: 'cardTitle',
    card_price_color: 'cardPrice',
    card_description_color: 'cardDescription',
    modal_background_color: 'modalBackground',
    modal_title_color: 'modalTitle',
    modal_price_color: 'modalPrice',
    modal_description_color: 'modalDescription',
    checkout_modal_background_color: 'checkoutModalBackground',
    checkout_modal_title_color: 'checkoutModalTitle',
    checkout_modal_description_color: 'checkoutModalDescription',
    checkout_modal_price_color: 'checkoutModalPrice',
    checkout_modal_button_color: 'checkoutModalButton',
    checkout_modal_button_text_color: 'checkoutModalButtonText',
    checkout_modal_border_color: 'checkoutModalBorder',
    button_primary_color: 'buttonPrimary',
    button_primary_text_color: 'buttonPrimaryText',
    button_secondary_color: 'buttonSecondary',
    button_secondary_text_color: 'buttonSecondaryText',
    text_primary_color: 'textPrimary',
    text_secondary_color: 'textSecondary',
    text_muted_color: 'textMuted',
    menu_main_header_text_color: 'menuMainHeaderText',
    menu_main_header_subtitle_color: 'menuMainHeaderSubtitle',
    menu_category_header_color: 'menuCategoryHeader',
    menu_category_active_color: 'menuCategoryActive',
    menu_category_inactive_color: 'menuCategoryInactive',
    menu_cart_badge_background_color: 'menuCartBadgeBackground',
    menu_cart_badge_text_color: 'menuCartBadgeText',
    border_color: 'border',
    success_color: 'success',
    warning_color: 'warning',
    error_color: 'error',
    link_color: 'link',
    primary_color: 'primary',
    secondary_color: 'secondary',
    accent_color: 'accent',
    cart_accent_color: 'cartAccent',
    checkout_accent_color: 'checkoutAccent',
}

function mergedTenant(draft: Bag, saved: Bag): Record<string, unknown> {
    return { ...(saved ?? {}), ...(draft ?? {}) }
}

/** The colour the storefront renders for this field, or undefined when it isn't a resolved store colour. */
export function resolveTenantColor(fieldId: string, draft: Bag, saved: Bag): string | undefined {
    const key = TENANT_COLOR_KEYS[fieldId]
    if (!key) return undefined
    const value = getTenantBranding(mergedTenant(draft, saved))[key]
    return typeof value === 'string' ? value : undefined
}

/** One resolve for every row of a render (the panel shows dozens of colours). */
export function createTenantColorResolver(draft: Bag, saved: Bag): (fieldId: string) => string | undefined {
    const branding = getTenantBranding(mergedTenant(draft, saved)) as unknown as Record<string, unknown>
    return (fieldId) => {
        const key = TENANT_COLOR_KEYS[fieldId]
        const value = key ? branding[key] : undefined
        return typeof value === 'string' ? value : undefined
    }
}
