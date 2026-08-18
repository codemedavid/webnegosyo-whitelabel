import { z } from 'zod'
import type { PromotionBanner } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Validates that a string is a plausible CSS color value.
 * Accepts: #rgb, #rrggbb, #rrggbbaa, rgb(...), rgba(...), hsl(...), hsla(...),
 * color-mix(...), named colors, transparent, inherit, initial, and empty string.
 * Rejects values containing <, >, ", ', ;, { or } to prevent CSS injection.
 * This is a defense-in-depth measure — branding values are set by tenant admins,
 * but malicious values could be stored via MITM or compromised accounts and then
 * injected into CSS custom properties or future <style> blocks.
 */
const CSS_INJECTION_CHARS = /[<>"';{}]/
function cssColorString() {
    return z.string().refine(
        (val) => val === '' || !CSS_INJECTION_CHARS.test(val),
        { message: 'Color value contains invalid characters' }
    )
}

// Schema for all branding fields
export const brandingSchema = z.object({
    // Brand identity. `logo_url` is NOT NULL in the database, so a cleared logo
    // persists as '' — never null — which the `...parsed` spread below preserves.
    logo_url: z.string().max(1000).optional().or(z.literal('')),
    // Storefront theme knobs (design-system presets)
    font_pair: z.enum(['theme', 'elegant serif', 'bold display', 'modern sans', 'warm editorial']).optional(),
    card_roundness: z.enum(['theme', 'sharp', 'soft', 'round']).optional(),
    brand_color: cssColorString().optional().or(z.literal('')),
    storefront_palette: z.enum(['theme', 'warm editorial', 'fine dining', 'cafe soft', 'bold diner', 'fresh green']).optional(),
    category_nav_style: z.enum(['theme', 'pills', 'chips', 'underline']).optional(),
    hero_preset: z.enum(['theme', 'centered', 'editorial', 'split', 'banner', 'collage', 'minimal', 'custom']).optional(),
    // Core colors
    primary_color: cssColorString().min(1),
    secondary_color: cssColorString().min(1),
    accent_color: cssColorString().optional().or(z.literal('')),
    background_color: cssColorString().optional().or(z.literal('')),
    // Custom page background: image + tint overlay. Opacities are 0..100
    // percents (the editor renders sliders); the storefront converts them to
    // 0..1 fractions in src/lib/background-overlay.ts.
    background_image_url: z.string().url().max(2048).optional().or(z.literal('')),
    background_image_opacity: z.number().int().min(0).max(100).optional(),
    background_image_fit: z.enum(['cover', 'contain', 'repeat']).optional(),
    background_image_position: z.enum(['center', 'top', 'bottom']).optional(),
    background_image_attachment: z.enum(['scroll', 'fixed']).optional(),
    background_overlay_color: cssColorString().optional().or(z.literal('')),
    background_overlay_opacity: z.number().int().min(0).max(100).optional(),
    header_color: cssColorString().optional().or(z.literal('')),
    header_font_color: cssColorString().optional().or(z.literal('')),
    // Card colors
    cards_color: cssColorString().optional().or(z.literal('')),
    cards_border_color: cssColorString().optional().or(z.literal('')),
    card_title_color: cssColorString().optional().or(z.literal('')),
    card_price_color: cssColorString().optional().or(z.literal('')),
    card_description_color: cssColorString().optional().or(z.literal('')),
    // Modal colors
    modal_background_color: cssColorString().optional().or(z.literal('')),
    modal_title_color: cssColorString().optional().or(z.literal('')),
    modal_price_color: cssColorString().optional().or(z.literal('')),
    modal_description_color: cssColorString().optional().or(z.literal('')),
    // Checkout interstitial modal colors
    checkout_modal_background_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_title_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_description_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_price_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_button_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_button_text_color: cssColorString().optional().or(z.literal('')),
    checkout_modal_border_color: cssColorString().optional().or(z.literal('')),
    // Cart page palette
    cart_background_color: cssColorString().optional().or(z.literal('')),
    cart_card_background_color: cssColorString().optional().or(z.literal('')),
    cart_text_color: cssColorString().optional().or(z.literal('')),
    cart_muted_text_color: cssColorString().optional().or(z.literal('')),
    cart_accent_color: cssColorString().optional().or(z.literal('')),
    cart_button_color: cssColorString().optional().or(z.literal('')),
    cart_button_text_color: cssColorString().optional().or(z.literal('')),
    cart_border_color: cssColorString().optional().or(z.literal('')),
    cart_summary_background_color: cssColorString().optional().or(z.literal('')),
    // Checkout page palette
    checkout_background_color: cssColorString().optional().or(z.literal('')),
    checkout_card_background_color: cssColorString().optional().or(z.literal('')),
    checkout_text_color: cssColorString().optional().or(z.literal('')),
    checkout_muted_text_color: cssColorString().optional().or(z.literal('')),
    checkout_accent_color: cssColorString().optional().or(z.literal('')),
    checkout_button_color: cssColorString().optional().or(z.literal('')),
    checkout_button_text_color: cssColorString().optional().or(z.literal('')),
    checkout_border_color: cssColorString().optional().or(z.literal('')),
    checkout_summary_background_color: cssColorString().optional().or(z.literal('')),
    // Button colors
    button_primary_color: cssColorString().optional().or(z.literal('')),
    button_primary_text_color: cssColorString().optional().or(z.literal('')),
    button_secondary_color: cssColorString().optional().or(z.literal('')),
    button_secondary_text_color: cssColorString().optional().or(z.literal('')),
    // Text colors
    text_primary_color: cssColorString().optional().or(z.literal('')),
    text_secondary_color: cssColorString().optional().or(z.literal('')),
    text_muted_color: cssColorString().optional().or(z.literal('')),
    menu_main_header_text_color: cssColorString().optional().or(z.literal('')),
    menu_main_header_subtitle_color: cssColorString().optional().or(z.literal('')),
    menu_category_header_color: cssColorString().optional().or(z.literal('')),
    menu_category_active_color: cssColorString().optional().or(z.literal('')),
    menu_category_inactive_color: cssColorString().optional().or(z.literal('')),
    menu_cart_badge_background_color: cssColorString().optional().or(z.literal('')),
    menu_cart_badge_text_color: cssColorString().optional().or(z.literal('')),
    // Search bar
    search_bar_enabled: z.boolean().optional(),
    search_bar_background: cssColorString().optional().or(z.literal('')),
    search_bar_text: cssColorString().optional().or(z.literal('')),
    search_bar_placeholder: cssColorString().optional().or(z.literal('')),
    search_bar_icon: cssColorString().optional().or(z.literal('')),
    search_bar_border: cssColorString().optional().or(z.literal('')),
    search_bar_focus_ring: cssColorString().optional().or(z.literal('')),
    search_bar_radius: z.enum(['pill', 'rounded', 'square']).optional(),
    search_bar_style: z.enum(['filled', 'outline', 'ghost']).optional(),
    border_color: cssColorString().optional().or(z.literal('')),
    // Utility colors
    success_color: cssColorString().optional().or(z.literal('')),
    warning_color: cssColorString().optional().or(z.literal('')),
    error_color: cssColorString().optional().or(z.literal('')),
    link_color: cssColorString().optional().or(z.literal('')),
    shadow_color: cssColorString().optional().or(z.literal('')),
    // Flash Screen
    flash_screen_feature_enabled: z.boolean().optional(),
    flash_screen_is_active: z.boolean().optional(),
    flash_screen_title: z.string().max(200).optional().or(z.literal('')),
    flash_screen_subtitle: z.string().max(500).optional().or(z.literal('')),
    flash_screen_image_url: z.string().optional().or(z.literal('')),
    flash_screen_background_color: cssColorString().optional().or(z.literal('')),
    flash_screen_text_color: cssColorString().optional().or(z.literal('')),
    flash_screen_duration_ms: z.number().min(500).max(15000).optional(),
    // Hero settings
    hero_section_enabled: z.boolean().optional(),
    hero_title: z.string().max(200).optional().or(z.literal('')),
    hero_description: z.string().max(1000).optional().or(z.literal('')),
    hero_kicker: z.string().max(60).optional().or(z.literal('')),
    hero_cta_primary_label: z.string().max(40).optional().or(z.literal('')),
    hero_cta_secondary_label: z.string().max(40).optional().or(z.literal('')),
    hero_featured_product_id: z.string().uuid().optional().or(z.literal('')),
    hero_image_url: z.string().url().max(2048).optional().or(z.literal('')),
    hero_link_url: z.string().max(2048).optional().or(z.literal('')),
    hero_title_color: cssColorString().optional().or(z.literal('')),
    hero_description_color: cssColorString().optional().or(z.literal('')),
    hero_background_color: cssColorString().optional().or(z.literal('')),
    hero_kicker_color: cssColorString().optional().or(z.literal('')),
    hero_cta_primary_color: cssColorString().optional().or(z.literal('')),
    hero_cta_primary_text_color: cssColorString().optional().or(z.literal('')),
    hero_cta_secondary_text_color: cssColorString().optional().or(z.literal('')),
    // Layout settings
    card_template: z.string().optional(),
    checkout_template: z.string().optional(),
    cart_template: z.string().optional(),
    page_layout: z.string().optional(),
    mobile_grid_columns: z.number().min(1).max(4).optional(),
    mobile_page_layout: z.string().optional().nullable(),
    mobile_card_template: z.string().optional().nullable(),
    // Header template & customization
    header_template: z.string().optional(),
    mobile_header_template: z.string().optional().nullable(),
    header_show_logo: z.boolean().optional(),
    header_show_name: z.boolean().optional(),
    header_show_cart: z.boolean().optional(),
    header_show_search: z.boolean().optional(),
    header_tagline: z.string().max(200).optional().or(z.literal('')),
    header_tagline_color: cssColorString().optional().or(z.literal('')),
    header_sticky: z.boolean().optional(),
    header_blur: z.boolean().optional(),
    header_shadow: z.boolean().optional(),
    header_logo_shape: z.enum(['circle', 'rounded', 'square']).optional(),
    header_height: z.enum(['compact', 'standard', 'tall']).optional(),
    // Announcement banner
    announcement_text: z.string().max(500).optional().or(z.literal('')),
    announcement_bg_color: cssColorString().optional().or(z.literal('')),
    announcement_text_color: cssColorString().optional().or(z.literal('')),
    is_announcement_visible: z.boolean().optional(),
    // Promotion banners
    promotion_image_url: z.string().optional().or(z.literal('')),
    is_promotion_visible: z.boolean().optional(),
    // Accepts '' too so a "Reset section" (which blanks every field) clears the
    // banners to an empty list rather than failing schema validation.
    promotion_banners: z.union([
        z.array(z.object({
            id: z.string(),
            imageUrl: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
        })),
        z.literal(''),
    ]).optional(),
    // Welcome page (multi-branch starter screen)
    welcome_entry_mode: z.enum(['order_types', 'single_cta']).optional(),
    welcome_show_order_types: z.boolean().optional(),
    welcome_cta_text: z.string().max(60).optional().or(z.literal('')),
    welcome_heading_text: z.string().max(200).optional().or(z.literal('')),
    welcome_subheading_text: z.string().max(300).optional().or(z.literal('')),
    welcome_text_align: z.enum(['left', 'center']).optional(),
    welcome_show_logo: z.boolean().optional(),
    // '' accepted for the same "Reset section" reason as promotion_banners.
    welcome_page_banners: z.union([
        z.array(z.object({
            id: z.string(),
            imageUrl: z.string(),
            format: z.enum(['landscape', 'portrait', 'square']),
            title: z.string().optional(),
            description: z.string().optional(),
        })),
        z.literal(''),
    ]).optional(),
    welcome_background_color: cssColorString().optional().or(z.literal('')),
    welcome_heading_color: cssColorString().optional().or(z.literal('')),
    welcome_subtext_color: cssColorString().optional().or(z.literal('')),
    welcome_tile_background_color: cssColorString().optional().or(z.literal('')),
    welcome_tile_icon_color: cssColorString().optional().or(z.literal('')),
    welcome_tile_text_color: cssColorString().optional().or(z.literal('')),
    welcome_cta_background_color: cssColorString().optional().or(z.literal('')),
    welcome_cta_text_color: cssColorString().optional().or(z.literal('')),
    // Footer
    footer_enabled: z.boolean().optional(),
    footer_theme: z.enum(['auto', 'light', 'dark', 'brand', 'midnight', 'minimal', 'custom']).optional(),
    footer_logo_url: z.string().optional().or(z.literal('')),
    footer_business_name: z.string().max(200).optional().or(z.literal('')),
    footer_tagline: z.string().max(300).optional().or(z.literal('')),
    footer_address: z.string().max(500).optional().or(z.literal('')),
    footer_phone: z.string().max(100).optional().or(z.literal('')),
    footer_whatsapp: z.string().max(100).optional().or(z.literal('')),
    footer_viber: z.string().max(100).optional().or(z.literal('')),
    footer_email: z.string().max(200).optional().or(z.literal('')),
    footer_facebook_url: z.string().max(500).optional().or(z.literal('')),
    footer_instagram_url: z.string().max(500).optional().or(z.literal('')),
    footer_tiktok_url: z.string().max(500).optional().or(z.literal('')),
    footer_twitter_url: z.string().max(500).optional().or(z.literal('')),
    footer_youtube_url: z.string().max(500).optional().or(z.literal('')),
    footer_facebook_name: z.string().max(100).optional().or(z.literal('')),
    footer_instagram_name: z.string().max(100).optional().or(z.literal('')),
    footer_tiktok_name: z.string().max(100).optional().or(z.literal('')),
    footer_twitter_name: z.string().max(100).optional().or(z.literal('')),
    footer_youtube_name: z.string().max(100).optional().or(z.literal('')),
    footer_about_us: z.string().optional().or(z.literal('')),
    footer_terms_of_service: z.string().optional().or(z.literal('')),
    footer_refund_policy: z.string().optional().or(z.literal('')),
    footer_privacy_policy: z.string().optional().or(z.literal('')),
    footer_copyright_text: z.string().max(500).optional().or(z.literal('')),
    footer_show_powered_by: z.boolean().optional(),
    footer_powered_by_text: z.string().max(200).optional().or(z.literal('')),
    footer_background_color: cssColorString().optional().or(z.literal('')),
    footer_text_color: cssColorString().optional().or(z.literal('')),
    footer_heading_color: cssColorString().optional().or(z.literal('')),
    footer_link_color: cssColorString().optional().or(z.literal('')),
    footer_muted_color: cssColorString().optional().or(z.literal('')),
    footer_icon_color: cssColorString().optional().or(z.literal('')),
    footer_icon_background_color: cssColorString().optional().or(z.literal('')),
    footer_border_color: cssColorString().optional().or(z.literal('')),
    // Per-device mobile overrides: { tenant_column_name: value } overlaid on
    // mobile viewports. Validated as a shallow string/number/bool/null map.
    mobile_overrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
})

export type BrandingInput = z.infer<typeof brandingSchema>

/**
 * Branding writes are PATCH operations. The Branding Studio normally submits
 * the complete draft, while API/MCP callers often update one surface at a time
 * (for example only the hero or footer). Keep `brandingSchema` as the full-form
 * contract, but validate persistence payloads against its partial equivalent.
 */
export const brandingPatchSchema = brandingSchema.partial()
export type BrandingPatchInput = z.infer<typeof brandingPatchSchema>

export type SaveBrandingResult = {
    success: boolean
    error?: string
    warning?: string
    skippedFields?: string[]
}

export const ROLLOUT_DEPENDENT_FIELDS = [
    'checkout_modal_background_color',
    'checkout_modal_title_color',
    'checkout_modal_description_color',
    'checkout_modal_price_color',
    'checkout_modal_button_color',
    'checkout_modal_button_text_color',
    'checkout_modal_border_color',
    'cart_background_color',
    'cart_card_background_color',
    'cart_text_color',
    'cart_muted_text_color',
    'cart_accent_color',
    'cart_button_color',
    'cart_button_text_color',
    'cart_border_color',
    'cart_summary_background_color',
    'checkout_background_color',
    'checkout_card_background_color',
    'checkout_text_color',
    'checkout_muted_text_color',
    'checkout_accent_color',
    'checkout_button_color',
    'checkout_button_text_color',
    'checkout_border_color',
    'checkout_summary_background_color',
    'menu_main_header_text_color',
    'menu_main_header_subtitle_color',
    'menu_category_header_color',
    'menu_category_active_color',
    'menu_category_inactive_color',
    'menu_cart_badge_background_color',
    'menu_cart_badge_text_color',
    'checkout_template',
    'cart_template',
    'page_layout',
    'mobile_grid_columns',
    'button_secondary_color',
    'button_secondary_text_color',
    'text_muted_color',
    'success_color',
    'warning_color',
    'error_color',
    'link_color',
    'shadow_color',
    'flash_screen_feature_enabled',
    'flash_screen_is_active',
    'flash_screen_title',
    'flash_screen_subtitle',
    'flash_screen_image_url',
    'flash_screen_background_color',
    'flash_screen_text_color',
    'flash_screen_duration_ms',
    'mobile_page_layout',
    'mobile_card_template',
    'mobile_overrides',
    'header_template',
    'mobile_header_template',
    'header_show_logo',
    'header_show_name',
    'header_show_cart',
    'header_show_search',
    'header_tagline',
    'header_tagline_color',
    'header_sticky',
    'header_blur',
    'header_shadow',
    'header_logo_shape',
    'header_height',
    'font_pair',
    'card_roundness',
    'brand_color',
    'storefront_palette',
    'category_nav_style',
    'hero_preset',
    'hero_kicker',
    'hero_cta_primary_label',
    'hero_cta_secondary_label',
    'hero_featured_product_id',
    'hero_image_url',
    'hero_link_url',
    'background_image_url',
    'background_image_opacity',
    'background_image_fit',
    'background_image_position',
    'background_image_attachment',
    'background_overlay_color',
    'background_overlay_opacity',
] as const

export function isMissingColumnError(error: { code?: string; message?: string; details?: string; hint?: string } | null): boolean {
    if (!error) return false
    const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
    if (error.code === '42703' || error.code === 'PGRST204') return true
    return text.includes('column') && (
        text.includes('does not exist') ||
        text.includes('could not find')
    )
}

function omitFields<T extends Record<string, unknown>>(payload: T, fields: readonly string[]): Partial<T> {
    const entries = Object.entries(payload).filter(([key]) => !fields.includes(key))
    return Object.fromEntries(entries) as Partial<T>
}

/**
 * Pure transform: turns validated branding input into the `tenants` update
 * payload. Empty promotion_banners becomes []; empty hero uuid/url fields
 * become NULL so an "unset" value persists as NULL rather than ''.
 */
export function buildBrandingUpdatePayload(parsed: BrandingPatchInput): Record<string, unknown> {
    return {
        ...parsed,
        ...(parsed.promotion_banners !== undefined
            ? {
                promotion_banners:
                    parsed.promotion_banners === ''
                        ? ([] as PromotionBanner[])
                        : (parsed.promotion_banners as PromotionBanner[]),
            }
            : {}),
        ...(parsed.welcome_page_banners !== undefined
            ? {
                welcome_page_banners:
                    parsed.welcome_page_banners === '' ? [] : parsed.welcome_page_banners,
            }
            : {}),
        ...(parsed.hero_featured_product_id === ''
            ? { hero_featured_product_id: null }
            : {}),
        // Empty hero media strings persist as NULL so "unset" stays unset.
        ...(parsed.hero_image_url === '' ? { hero_image_url: null } : {}),
        ...(parsed.background_image_url === '' ? { background_image_url: null } : {}),
        ...(parsed.hero_link_url === '' ? { hero_link_url: null } : {}),
    }
}

/**
 * Persists branding for a tenant using the supplied Supabase client. This is
 * cookie-free and caller-agnostic: the web server action passes its
 * cookie-scoped client (after verifyTenantAdmin), while the MCP admin surface
 * passes a service-role client (already authorized upstream by verifyMcpKey).
 *
 * Does NOT authenticate or revalidate — those are the caller's responsibility.
 * If rollout-dependent columns are missing in the current environment, retries
 * once with those fields omitted so the rest of branding still persists.
 */
export async function writeBrandingWithClient(
    client: SupabaseClient<Database>,
    tenantId: string,
    branding: BrandingPatchInput,
): Promise<SaveBrandingResult> {
    let parsed: BrandingPatchInput
    try {
        parsed = brandingPatchSchema.parse(branding)
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: `Validation error: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}` }
        }
        return { success: false, error: error instanceof Error ? error.message : 'An unexpected error occurred' }
    }

    const updatePayload = buildBrandingUpdatePayload(parsed)

    const { error: firstError } = await client
        .from('tenants')
        // Cast through unknown to satisfy strict generic constraints
        .update(updatePayload as unknown as never)
        .eq('id', tenantId)
        .select('id')
        .single()

    let warning: string | undefined
    let skippedFields: string[] | undefined
    let error = firstError

    if (error && isMissingColumnError(error)) {
        const fallbackPayload = omitFields(updatePayload, ROLLOUT_DEPENDENT_FIELDS)
        const { error: fallbackError } = await client
            .from('tenants')
            .update(fallbackPayload as unknown as never)
            .eq('id', tenantId)
            .select('id')
            .single()

        if (!fallbackError) {
            error = null
            skippedFields = [...ROLLOUT_DEPENDENT_FIELDS]
            warning = 'Saved core branding, but layout/checkout settings were skipped until database migrations are applied.'
            console.warn('[writeBrandingWithClient] Saved with skipped rollout fields:', skippedFields)
        } else {
            error = fallbackError
        }
    }

    if (error) {
        console.error('[writeBrandingWithClient] Database error:', error)
        return { success: false, error: error.message }
    }

    return { success: true, warning, skippedFields }
}
