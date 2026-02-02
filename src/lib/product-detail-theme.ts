/**
 * Product Detail Page Theme Management
 * Provides hook and utilities for product detail page customization
 * Merges global branding with product-detail specific settings
 */

import { createClient } from '@/lib/supabase/client'
import type { BrandingColors } from '@/lib/branding-utils'

/**
 * Set the alpha (opacity) of a color string.
 * Local copy to avoid circular dependency/build issues.
 */
function setAlpha(color: string, alpha: number): string {
    const clampedAlpha = Math.max(0, Math.min(1, alpha))
    const trimmed = color.trim()

    // Handle hex colors (#RGB, #RRGGBB, #RRGGBBAA)
    const hexMatch = /^#([A-Fa-f0-9]{3,8})$/.exec(trimmed)
    if (hexMatch) {
        const hex = hexMatch[1]
        let r: number, g: number, b: number

        if (hex.length === 3) {
            // #RGB -> #RRGGBB
            r = parseInt(hex[0] + hex[0], 16)
            g = parseInt(hex[1] + hex[1], 16)
            b = parseInt(hex[2] + hex[2], 16)
        } else if (hex.length === 4) {
            // #RGBA -> ignore existing alpha
            r = parseInt(hex[0] + hex[0], 16)
            g = parseInt(hex[1] + hex[1], 16)
            b = parseInt(hex[2] + hex[2], 16)
        } else if (hex.length === 6) {
            // #RRGGBB
            r = parseInt(hex.substring(0, 2), 16)
            g = parseInt(hex.substring(2, 4), 16)
            b = parseInt(hex.substring(4, 6), 16)
        } else if (hex.length === 8) {
            // #RRGGBBAA -> ignore existing alpha
            r = parseInt(hex.substring(0, 2), 16)
            g = parseInt(hex.substring(2, 4), 16)
            b = parseInt(hex.substring(4, 6), 16)
        } else {
            return `rgba(0, 0, 0, ${clampedAlpha})`
        }

        return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
    }

    // Handle rgb() and rgba()
    const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10)
        const g = parseInt(rgbMatch[2], 10)
        const b = parseInt(rgbMatch[3], 10)
        return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`
    }

    // Handle hsl() and hsla()
    const hslMatch = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(trimmed)
    if (hslMatch) {
        const h = parseFloat(hslMatch[1])
        const s = parseFloat(hslMatch[2])
        const l = parseFloat(hslMatch[3])
        return `hsla(${h}, ${s}%, ${l}%, ${clampedAlpha})`
    }

    return `rgba(0, 0, 0, ${clampedAlpha})`
}

export interface ProductDetailSettings {
    id?: string
    tenant_id: string

    page_background_color?: string
    page_background_gradient?: string

    header_background_color?: string
    header_button_background_color?: string
    header_button_icon_color?: string

    image_background_color?: string
    image_placeholder_color?: string
    sale_badge_background_color?: string
    sale_badge_text_color?: string

    product_name_color?: string
    product_name_font_size?: string
    product_name_font_weight?: string

    breadcrumb_color?: string
    breadcrumb_active_color?: string

    description_color?: string
    description_font_size?: string

    dietary_tag_background_color?: string
    dietary_tag_text_color?: string
    dietary_tag_border_color?: string

    variation_section_title_color?: string
    variation_section_title_font_size?: string

    variation_option_background_color?: string
    variation_option_text_color?: string
    variation_option_border_color?: string
    variation_option_selected_background_color?: string
    variation_option_selected_text_color?: string
    variation_option_selected_border_color?: string

    variation_price_modifier_color?: string
    variation_required_badge_color?: string

    addon_section_title_color?: string
    addon_section_title_font_size?: string

    addon_background_color?: string
    addon_text_color?: string
    addon_border_color?: string
    addon_selected_background_color?: string
    addon_selected_text_color?: string
    addon_selected_border_color?: string
    addon_selected_check_color?: string
    addon_price_color?: string
    addon_price_free_text?: string

    related_section_title_color?: string
    related_section_title_font_size?: string
    related_item_background_color?: string
    related_item_name_color?: string
    related_item_price_color?: string

    footer_background_color?: string
    footer_border_color?: string
    footer_shadow_color?: string

    summary_text_color?: string
    total_price_color?: string
    original_price_color?: string

    quantity_controls_background?: string
    quantity_button_color?: string
    quantity_text_color?: string

    buy_now_button_background?: string
    buy_now_button_text_color?: string
    buy_now_button_border_color?: string

    add_to_cart_button_background?: string
    add_to_cart_button_text_color?: string
    add_to_cart_button_shadow_color?: string

    modal_background_color?: string
    modal_close_button_color?: string
    modal_close_button_background?: string

    font_family_heading?: string
    font_family_body?: string

    section_padding?: string
    card_border_radius?: string
    button_border_radius?: string

    enable_animations?: boolean
    animation_speed?: 'slow' | 'normal' | 'fast'

    created_at?: string
    updated_at?: string
}

export const DEFAULT_PRODUCT_DETAIL_SETTINGS: Partial<ProductDetailSettings> = {
    page_background_color: '#ffffff',
    image_background_color: '#f3f4f6',
    image_placeholder_color: '#9ca3af',
    sale_badge_background_color: '#ef4444',
    sale_badge_text_color: '#ffffff',
    product_name_color: '#111827',
    product_name_font_size: '24px',
    product_name_font_weight: '700',
    description_color: '#6b7280',
    description_font_size: '14px',
    variation_section_title_color: '#111827',
    variation_section_title_font_size: '16px',
    variation_option_background_color: '#f9fafb',
    variation_option_text_color: '#374151',
    variation_option_border_color: '#e5e7eb',
    variation_option_selected_text_color: '#ffffff',
    variation_price_modifier_color: '#6b7280',
    variation_required_badge_color: '#6b7280',
    addon_section_title_color: '#111827',
    addon_section_title_font_size: '16px',
    addon_background_color: '#ffffff',
    addon_text_color: '#111827',
    addon_border_color: '#e5e7eb',
    addon_price_color: '#6b7280',
    addon_price_free_text: 'Free',
    related_section_title_color: '#111827',
    related_section_title_font_size: '18px',
    related_item_name_color: '#111827',
    footer_background_color: '#ffffff',
    footer_border_color: '#e5e7eb',
    footer_shadow_color: 'rgba(0,0,0,0.1)',
    summary_text_color: '#6b7280',
    total_price_color: '#111827',
    original_price_color: '#9ca3af',
    quantity_controls_background: '#f3f4f6',
    quantity_button_color: '#374151',
    quantity_text_color: '#111827',
    add_to_cart_button_text_color: '#ffffff',
    add_to_cart_button_shadow_color: 'rgba(0,0,0,0.1)',
    modal_background_color: 'rgba(0,0,0,0.95)',
    modal_close_button_color: '#ffffff',
    modal_close_button_background: 'rgba(255,255,255,0.1)',
    section_padding: '24px',
    card_border_radius: '12px',
    button_border_radius: '9999px',
    enable_animations: true,
    animation_speed: 'normal',
}

export interface ProductDetailColors {
    pageBackground: string
    pageGradient?: string

    headerBackground: string
    headerButtonBackground: string
    headerButtonIcon: string

    imageBackground: string
    imagePlaceholder: string
    saleBadgeBackground: string
    saleBadgeText: string

    productName: string
    productNameFontSize: string
    productNameFontWeight: string

    breadcrumb: string
    breadcrumbActive: string

    description: string
    descriptionFontSize: string

    dietaryTagBackground: string
    dietaryTagText: string
    dietaryTagBorder: string

    variationSectionTitle: string
    variationSectionTitleFontSize: string

    variationOptionBackground: string
    variationOptionText: string
    variationOptionBorder: string
    variationOptionSelectedBackground: string
    variationOptionSelectedText: string
    variationOptionSelectedBorder: string

    variationPriceModifier: string
    variationRequiredBadge: string

    addonSectionTitle: string
    addonSectionTitleFontSize: string

    addonBackground: string
    addonText: string
    addonBorder: string
    addonSelectedBackground: string
    addonSelectedText: string
    addonSelectedBorder: string
    addonSelectedCheck: string
    addonPrice: string
    addonPriceFreeText: string

    relatedSectionTitle: string
    relatedSectionTitleFontSize: string
    relatedItemBackground: string
    relatedItemName: string
    relatedItemPrice: string

    footerBackground: string
    footerBorder: string
    footerShadow: string

    summaryText: string
    totalPrice: string
    originalPrice: string

    quantityControlsBackground: string
    quantityButton: string
    quantityText: string

    buyNowButtonBackground: string
    buyNowButtonText: string
    buyNowButtonBorder: string

    addToCartButtonBackground: string
    addToCartButtonText: string
    addToCartButtonShadow: string

    modalBackground: string
    modalCloseButton: string
    modalCloseButtonBackground: string

    fontFamilyHeading: string
    fontFamilyBody: string

    sectionPadding: string
    cardBorderRadius: string
    buttonBorderRadius: string

    enableAnimations: boolean
    animationSpeed: 'slow' | 'normal' | 'fast'

    primary: string
    secondary: string
    textPrimary: string
    textSecondary: string
    textMuted: string
    border: string
}

export function mergeSettingsWithBranding(
    settings: ProductDetailSettings | null,
    branding: BrandingColors
): ProductDetailColors {
    const defaults = DEFAULT_PRODUCT_DETAIL_SETTINGS
    const s: Partial<ProductDetailSettings> = settings || {}

    return {
        pageBackground: s.page_background_color || branding.background,
        pageGradient: s.page_background_gradient,

        headerBackground: s.header_background_color || branding.header,
        headerButtonBackground: s.header_button_background_color || '#ffffff',
        headerButtonIcon: s.header_button_icon_color || branding.headerFont,

        imageBackground: s.image_background_color || defaults.image_background_color!,
        imagePlaceholder: s.image_placeholder_color || defaults.image_placeholder_color!,
        saleBadgeBackground: s.sale_badge_background_color || defaults.sale_badge_background_color!,
        saleBadgeText: s.sale_badge_text_color || defaults.sale_badge_text_color!,

        productName: s.product_name_color || branding.textPrimary,
        productNameFontSize: s.product_name_font_size || defaults.product_name_font_size!,
        productNameFontWeight: s.product_name_font_weight || defaults.product_name_font_weight!,

        breadcrumb: s.breadcrumb_color || branding.textMuted,
        breadcrumbActive: s.breadcrumb_active_color || branding.link,

        description: s.description_color || branding.textSecondary,
        descriptionFontSize: s.description_font_size || defaults.description_font_size!,

        dietaryTagBackground: s.dietary_tag_background_color || 'transparent',
        dietaryTagText: s.dietary_tag_text_color || branding.textPrimary,
        dietaryTagBorder: s.dietary_tag_border_color || branding.border,

        variationSectionTitle: s.variation_section_title_color || branding.textPrimary,
        variationSectionTitleFontSize: s.variation_section_title_font_size || defaults.variation_section_title_font_size!,

        variationOptionBackground: s.variation_option_background_color || defaults.variation_option_background_color!,
        variationOptionText: s.variation_option_text_color || defaults.variation_option_text_color!,
        variationOptionBorder: s.variation_option_border_color || defaults.variation_option_border_color!,
        variationOptionSelectedBackground: s.variation_option_selected_background_color || branding.primary,
        variationOptionSelectedText: s.variation_option_selected_text_color || defaults.variation_option_selected_text_color!,
        variationOptionSelectedBorder: s.variation_option_selected_border_color || branding.primary,

        variationPriceModifier: s.variation_price_modifier_color || defaults.variation_price_modifier_color!,
        variationRequiredBadge: s.variation_required_badge_color || defaults.variation_required_badge_color!,

        addonSectionTitle: s.addon_section_title_color || branding.textPrimary,
        addonSectionTitleFontSize: s.addon_section_title_font_size || defaults.addon_section_title_font_size!,

        addonBackground: s.addon_background_color || defaults.addon_background_color!,
        addonText: s.addon_text_color || defaults.addon_text_color!,
        addonBorder: s.addon_border_color || defaults.addon_border_color!,
        addonSelectedBackground: s.addon_selected_background_color || setAlpha(branding.primary, 0.03),
        addonSelectedText: s.addon_selected_text_color || branding.primary,
        addonSelectedBorder: s.addon_selected_border_color || branding.primary,
        addonSelectedCheck: s.addon_selected_check_color || branding.primary,
        addonPrice: s.addon_price_color || defaults.addon_price_color!,
        addonPriceFreeText: s.addon_price_free_text || defaults.addon_price_free_text!,

        relatedSectionTitle: s.related_section_title_color || branding.textPrimary,
        relatedSectionTitleFontSize: s.related_section_title_font_size || defaults.related_section_title_font_size!,
        relatedItemBackground: s.related_item_background_color || branding.cards,
        relatedItemName: s.related_item_name_color || branding.cardTitle,
        relatedItemPrice: s.related_item_price_color || branding.cardPrice,

        footerBackground: s.footer_background_color || branding.cards,
        footerBorder: s.footer_border_color || branding.border,
        footerShadow: s.footer_shadow_color || defaults.footer_shadow_color!,

        summaryText: s.summary_text_color || branding.textMuted,
        totalPrice: s.total_price_color || branding.textPrimary,
        originalPrice: s.original_price_color || branding.textMuted,

        quantityControlsBackground: s.quantity_controls_background || defaults.quantity_controls_background!,
        quantityButton: s.quantity_button_color || defaults.quantity_button_color!,
        quantityText: s.quantity_text_color || defaults.quantity_text_color!,

        buyNowButtonBackground: s.buy_now_button_background || branding.buttonSecondary,
        buyNowButtonText: s.buy_now_button_text_color || branding.buttonPrimary,
        buyNowButtonBorder: s.buy_now_button_border_color || branding.primary,

        addToCartButtonBackground: s.add_to_cart_button_background || branding.buttonPrimary,
        addToCartButtonText: s.add_to_cart_button_text_color || defaults.add_to_cart_button_text_color!,
        addToCartButtonShadow: s.add_to_cart_button_shadow_color || defaults.add_to_cart_button_shadow_color!,

        modalBackground: s.modal_background_color || defaults.modal_background_color!,
        modalCloseButton: s.modal_close_button_color || defaults.modal_close_button_color!,
        modalCloseButtonBackground: s.modal_close_button_background || defaults.modal_close_button_background!,

        fontFamilyHeading: s.font_family_heading || 'system-ui, -apple-system, sans-serif',
        fontFamilyBody: s.font_family_body || 'system-ui, -apple-system, sans-serif',

        sectionPadding: s.section_padding || defaults.section_padding!,
        cardBorderRadius: s.card_border_radius || defaults.card_border_radius!,
        buttonBorderRadius: s.button_border_radius || defaults.button_border_radius!,

        enableAnimations: s.enable_animations ?? defaults.enable_animations!,
        animationSpeed: s.animation_speed || defaults.animation_speed!,

        primary: branding.primary,
        secondary: branding.secondary,
        textPrimary: branding.textPrimary,
        textSecondary: branding.textSecondary,
        textMuted: branding.textMuted,
        border: branding.border,
    }
}

export function getProductDetailThemeCSS(colors: ProductDetailColors): React.CSSProperties {
    const speedMap = {
        slow: '0.5s',
        normal: '0.3s',
        fast: '0.15s',
    }
    const transitionDuration = colors.enableAnimations ? speedMap[colors.animationSpeed] : '0s'

    // Helper to ensure valid CSS values with fallbacks
    const val = (v: string | undefined, fallback: string): string => v || fallback

    return {
        '--pd-page-background': val(colors.pageBackground, '#ffffff'),
        '--pd-page-gradient': val(colors.pageGradient, 'none'),
        '--pd-header-background': val(colors.headerBackground, 'transparent'),
        '--pd-header-button-bg': val(colors.headerButtonBackground, '#ffffff'),
        '--pd-header-button-icon': val(colors.headerButtonIcon, '#374151'),
        '--pd-image-background': val(colors.imageBackground, '#f3f4f6'),
        '--pd-image-placeholder': val(colors.imagePlaceholder, '#9ca3af'),
        '--pd-sale-badge-bg': val(colors.saleBadgeBackground, '#ef4444'),
        '--pd-sale-badge-text': val(colors.saleBadgeText, '#ffffff'),
        '--pd-product-name': val(colors.productName, '#111827'),
        '--pd-product-name-font-size': val(colors.productNameFontSize, '24px'),
        '--pd-product-name-font-weight': val(colors.productNameFontWeight, '700'),
        '--pd-breadcrumb': val(colors.breadcrumb, '#6b7280'),
        '--pd-breadcrumb-active': val(colors.breadcrumbActive, '#111827'),
        '--pd-description': val(colors.description, '#6b7280'),
        '--pd-description-font-size': val(colors.descriptionFontSize, '14px'),
        '--pd-dietary-tag-bg': val(colors.dietaryTagBackground, 'transparent'),
        '--pd-dietary-tag-text': val(colors.dietaryTagText, '#374151'),
        '--pd-dietary-tag-border': val(colors.dietaryTagBorder, '#e5e7eb'),
        '--pd-variation-title': val(colors.variationSectionTitle, '#111827'),
        '--pd-variation-title-font-size': val(colors.variationSectionTitleFontSize, '16px'),
        '--pd-variation-option-bg': val(colors.variationOptionBackground, '#f9fafb'),
        '--pd-variation-option-text': val(colors.variationOptionText, '#374151'),
        '--pd-variation-option-border': val(colors.variationOptionBorder, '#e5e7eb'),
        '--pd-variation-selected-bg': val(colors.variationOptionSelectedBackground, '#3b82f6'),
        '--pd-variation-selected-text': val(colors.variationOptionSelectedText, '#ffffff'),
        '--pd-variation-selected-border': val(colors.variationOptionSelectedBorder, '#3b82f6'),
        '--pd-variation-price': val(colors.variationPriceModifier, '#6b7280'),
        '--pd-variation-required': val(colors.variationRequiredBadge, '#6b7280'),
        '--pd-addon-title': val(colors.addonSectionTitle, '#111827'),
        '--pd-addon-title-font-size': val(colors.addonSectionTitleFontSize, '16px'),
        '--pd-addon-bg': val(colors.addonBackground, '#ffffff'),
        '--pd-addon-text': val(colors.addonText, '#111827'),
        '--pd-addon-border': val(colors.addonBorder, '#e5e7eb'),
        '--pd-addon-selected-bg': val(colors.addonSelectedBackground, 'rgba(59, 130, 246, 0.08)'),
        '--pd-addon-selected-text': val(colors.addonSelectedText, '#3b82f6'),
        '--pd-addon-selected-border': val(colors.addonSelectedBorder, '#3b82f6'),
        '--pd-addon-check': val(colors.addonSelectedCheck, '#3b82f6'),
        '--pd-addon-price': val(colors.addonPrice, '#6b7280'),
        '--pd-related-title': val(colors.relatedSectionTitle, '#111827'),
        '--pd-related-title-font-size': val(colors.relatedSectionTitleFontSize, '18px'),
        '--pd-related-item-bg': val(colors.relatedItemBackground, '#f9fafb'),
        '--pd-related-item-name': val(colors.relatedItemName, '#111827'),
        '--pd-related-item-price': val(colors.relatedItemPrice, '#3b82f6'),
        '--pd-footer-bg': val(colors.footerBackground, '#ffffff'),
        '--pd-footer-border': val(colors.footerBorder, '#e5e7eb'),
        '--pd-footer-shadow': val(colors.footerShadow, 'rgba(0,0,0,0.1)'),
        '--pd-summary-text': val(colors.summaryText, '#6b7280'),
        '--pd-total-price': val(colors.totalPrice, '#111827'),
        '--pd-original-price': val(colors.originalPrice, '#9ca3af'),
        '--pd-qty-bg': val(colors.quantityControlsBackground, '#f3f4f6'),
        '--pd-qty-btn': val(colors.quantityButton, '#374151'),
        '--pd-qty-text': val(colors.quantityText, '#111827'),
        '--pd-buy-now-bg': val(colors.buyNowButtonBackground, '#ffffff'),
        '--pd-buy-now-text': val(colors.buyNowButtonText, '#111827'),
        '--pd-buy-now-border': val(colors.buyNowButtonBorder, '#3b82f6'),
        '--pd-add-cart-bg': val(colors.addToCartButtonBackground, '#3b82f6'),
        '--pd-add-cart-text': val(colors.addToCartButtonText, '#ffffff'),
        '--pd-add-cart-shadow': val(colors.addToCartButtonShadow, 'rgba(0,0,0,0.1)'),
        '--pd-modal-bg': val(colors.modalBackground, 'rgba(0,0,0,0.95)'),
        '--pd-modal-close': val(colors.modalCloseButton, '#ffffff'),
        '--pd-modal-close-bg': val(colors.modalCloseButtonBackground, 'rgba(255,255,255,0.1)'),
        '--pd-font-heading': val(colors.fontFamilyHeading, 'system-ui, -apple-system, sans-serif'),
        '--pd-font-body': val(colors.fontFamilyBody, 'system-ui, -apple-system, sans-serif'),
        '--pd-section-padding': val(colors.sectionPadding, '24px'),
        '--pd-card-radius': val(colors.cardBorderRadius, '12px'),
        '--pd-btn-radius': val(colors.buttonBorderRadius, '9999px'),
        '--pd-transition-duration': transitionDuration,
        '--pd-primary': val(colors.primary, '#3b82f6'),
        '--pd-secondary': val(colors.secondary, '#64748b'),
        '--pd-text-primary': val(colors.textPrimary, '#111827'),
        '--pd-text-secondary': val(colors.textSecondary, '#6b7280'),
        '--pd-text-muted': val(colors.textMuted, '#9ca3af'),
        '--pd-border': val(colors.border, '#e5e7eb'),
    } as React.CSSProperties
}

export function computeProductDetailStyles(colors: ProductDetailColors): {
    container: React.CSSProperties
    name: React.CSSProperties
    description: React.CSSProperties
    variationButton: React.CSSProperties
    variationButtonSelected: React.CSSProperties
    addonButton: React.CSSProperties
    addonButtonSelected: React.CSSProperties
    footer: React.CSSProperties
    buttonBuyNow: React.CSSProperties
    buttonAddToCart: React.CSSProperties
} {
    return {
        container: {
            backgroundColor: colors.pageBackground,
            background: colors.pageGradient ? `linear-gradient(${colors.pageGradient})` : colors.pageBackground,
            fontFamily: colors.fontFamilyBody,
        },
        name: {
            color: colors.productName,
            fontSize: colors.productNameFontSize,
            fontWeight: colors.productNameFontWeight as React.CSSProperties['fontWeight'],
            fontFamily: colors.fontFamilyHeading,
        },
        description: {
            color: colors.description,
            fontSize: colors.descriptionFontSize,
        },
        variationButton: {
            backgroundColor: colors.variationOptionBackground,
            color: colors.variationOptionText,
            borderColor: colors.variationOptionBorder,
            borderRadius: colors.buttonBorderRadius,
        },
        variationButtonSelected: {
            backgroundColor: colors.variationOptionSelectedBackground,
            color: colors.variationOptionSelectedText,
            borderColor: colors.variationOptionSelectedBorder,
        },
        addonButton: {
            backgroundColor: colors.addonBackground,
            color: colors.addonText,
            borderColor: colors.addonBorder,
            borderRadius: colors.cardBorderRadius,
        },
        addonButtonSelected: {
            backgroundColor: colors.addonSelectedBackground,
            color: colors.addonSelectedText,
            borderColor: colors.addonSelectedBorder,
        },
        footer: {
            backgroundColor: colors.footerBackground,
            borderColor: colors.footerBorder,
            boxShadow: `0 -4px 20px -2px ${colors.footerShadow}`,
        },
        buttonBuyNow: {
            backgroundColor: colors.buyNowButtonBackground,
            color: colors.buyNowButtonText,
            borderColor: colors.buyNowButtonBorder,
            borderRadius: colors.buttonBorderRadius,
        },
        buttonAddToCart: {
            backgroundColor: colors.addToCartButtonBackground,
            color: colors.addToCartButtonText,
            boxShadow: `0 4px 14px ${colors.addToCartButtonShadow}`,
            borderRadius: colors.buttonBorderRadius,
        },
    }
}

export async function fetchProductDetailSettings(tenantId: string): Promise<ProductDetailSettings | null> {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('product_detail_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle()

    if (error) {
        console.error('Error fetching product detail settings:', error)
        return null
    }

    return data as ProductDetailSettings | null
}
