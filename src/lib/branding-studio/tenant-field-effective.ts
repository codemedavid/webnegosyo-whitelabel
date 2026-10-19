/**
 * What the storefront renders for a store-wide colour field, worked out by the
 * storefront's own resolver (getTenantBranding: palette, legacy brand_color,
 * modal → cards → palette fallbacks), so the Studio never shows a colour the
 * store doesn't use.
 */

import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'
import { withJsonColumnsPreview } from '@/lib/branding-studio/studio-columns'
import { readTrackingStyle, TRACKING_COLOR_KEYS, type TrackingColorKey } from '@/lib/tracking-style/keys'
import { resolveTrackingSettingColors } from '@/lib/tracking-style/palette'

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

const TRACKING_FIELD_PREFIX = 'tracking_style.'
const TRACKING_COLOR_FIELDS = new Set<string>(TRACKING_COLOR_KEYS)

function mergedTenant(draft: Bag, saved: Bag): Record<string, unknown> {
    // Virtual-field edits (`tracking_style.hero_color`) reach the column itself.
    return { ...(saved ?? {}), ...withJsonColumnsPreview({ ...(draft ?? {}) }, saved) }
}

/** `tracking_style.hero_color` → `hero_color` when it is a tracking colour setting. */
function trackingColorKey(fieldId: string): TrackingColorKey | null {
    if (!fieldId.startsWith(TRACKING_FIELD_PREFIX)) return null
    const key = fieldId.slice(TRACKING_FIELD_PREFIX.length)
    return TRACKING_COLOR_FIELDS.has(key) ? (key as TrackingColorKey) : null
}

/** The colour the storefront renders for this field, or undefined when it isn't a resolved store colour. */
export function resolveTenantColor(fieldId: string, draft: Bag, saved: Bag): string | undefined {
    return createTenantColorResolver(draft, saved)(fieldId)
}

/** One resolve for every row of a render (the panel shows dozens of colours). */
export function createTenantColorResolver(draft: Bag, saved: Bag): (fieldId: string) => string | undefined {
    const tenant = mergedTenant(draft, saved)
    const branding = getTenantBranding(tenant) as unknown as Record<string, unknown>
    let trackingColors: Record<TrackingColorKey, string> | null = null
    return (fieldId) => {
        const trackingKey = trackingColorKey(fieldId)
        if (trackingKey) {
            // The order page and loyalty card resolve through their own chain (page → brand).
            trackingColors ??= resolveTrackingSettingColors(branding as unknown as BrandingColors, readTrackingStyle(tenant))
            return trackingColors[trackingKey]
        }
        const key = TENANT_COLOR_KEYS[fieldId]
        const value = key ? branding[key] : undefined
        return typeof value === 'string' ? value : undefined
    }
}
