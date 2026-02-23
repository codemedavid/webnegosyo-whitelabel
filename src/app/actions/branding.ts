'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import { z } from 'zod'
import type { PromotionBanner } from '@/types/database'

// Schema for all branding fields
const brandingSchema = z.object({
    // Core colors
    primary_color: z.string().min(1),
    secondary_color: z.string().min(1),
    accent_color: z.string().optional().or(z.literal('')),
    background_color: z.string().optional().or(z.literal('')),
    header_color: z.string().optional().or(z.literal('')),
    header_font_color: z.string().optional().or(z.literal('')),
    // Card colors
    cards_color: z.string().optional().or(z.literal('')),
    cards_border_color: z.string().optional().or(z.literal('')),
    card_title_color: z.string().optional().or(z.literal('')),
    card_price_color: z.string().optional().or(z.literal('')),
    card_description_color: z.string().optional().or(z.literal('')),
    // Modal colors
    modal_background_color: z.string().optional().or(z.literal('')),
    modal_title_color: z.string().optional().or(z.literal('')),
    modal_price_color: z.string().optional().or(z.literal('')),
    modal_description_color: z.string().optional().or(z.literal('')),
    // Checkout interstitial modal colors
    checkout_modal_background_color: z.string().optional().or(z.literal('')),
    checkout_modal_title_color: z.string().optional().or(z.literal('')),
    checkout_modal_description_color: z.string().optional().or(z.literal('')),
    checkout_modal_price_color: z.string().optional().or(z.literal('')),
    checkout_modal_button_color: z.string().optional().or(z.literal('')),
    checkout_modal_button_text_color: z.string().optional().or(z.literal('')),
    checkout_modal_border_color: z.string().optional().or(z.literal('')),
    // Button colors
    button_primary_color: z.string().optional().or(z.literal('')),
    button_primary_text_color: z.string().optional().or(z.literal('')),
    // Text colors
    text_primary_color: z.string().optional().or(z.literal('')),
    text_secondary_color: z.string().optional().or(z.literal('')),
    menu_main_header_text_color: z.string().optional().or(z.literal('')),
    menu_main_header_subtitle_color: z.string().optional().or(z.literal('')),
    menu_category_header_color: z.string().optional().or(z.literal('')),
    menu_category_active_color: z.string().optional().or(z.literal('')),
    menu_category_inactive_color: z.string().optional().or(z.literal('')),
    menu_cart_badge_background_color: z.string().optional().or(z.literal('')),
    menu_cart_badge_text_color: z.string().optional().or(z.literal('')),
    border_color: z.string().optional().or(z.literal('')),
    // Hero settings
    hero_title: z.string().optional().or(z.literal('')),
    hero_description: z.string().optional().or(z.literal('')),
    hero_title_color: z.string().optional().or(z.literal('')),
    hero_description_color: z.string().optional().or(z.literal('')),
    // Layout settings
    card_template: z.string().optional(),
    page_layout: z.string().optional(),
    mobile_grid_columns: z.number().optional(),
    // Announcement banner
    announcement_text: z.string().optional().or(z.literal('')),
    announcement_bg_color: z.string().optional().or(z.literal('')),
    announcement_text_color: z.string().optional().or(z.literal('')),
    is_announcement_visible: z.boolean().optional(),
    // Promotion banners
    promotion_image_url: z.string().optional().or(z.literal('')),
    is_promotion_visible: z.boolean().optional(),
    promotion_banners: z.array(z.object({
        id: z.string(),
        imageUrl: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
    })).optional(),
})

export type BrandingInput = z.infer<typeof brandingSchema>
type SaveBrandingResult = {
    success: boolean
    error?: string
    warning?: string
    skippedFields?: string[]
}

const ROLLOUT_DEPENDENT_FIELDS = [
    'checkout_modal_background_color',
    'checkout_modal_title_color',
    'checkout_modal_description_color',
    'checkout_modal_price_color',
    'checkout_modal_button_color',
    'checkout_modal_button_text_color',
    'checkout_modal_border_color',
    'menu_main_header_text_color',
    'menu_main_header_subtitle_color',
    'menu_category_header_color',
    'menu_category_active_color',
    'menu_category_inactive_color',
    'menu_cart_badge_background_color',
    'menu_cart_badge_text_color',
    'page_layout',
    'mobile_grid_columns',
] as const

function isMissingColumnError(error: { code?: string; message?: string; details?: string; hint?: string } | null): boolean {
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
 * Save branding settings and revalidate cached pages for instant updates.
 * This server action ensures that branding changes appear immediately
 * without requiring a page refresh or waiting for cache TTL to expire.
 */
export async function saveBrandingAction(
    tenantId: string,
    tenantSlug: string,
    branding: BrandingInput
): Promise<SaveBrandingResult> {
    try {
        const supabase = await createClient()

        // Verify caller is admin of this tenant (or superadmin)
        await verifyTenantAdmin(tenantId)

        // Validate input
        const parsed = brandingSchema.parse(branding)

        // Transform promotion_banners to match database format if present
        const updatePayload = {
            ...parsed,
            promotion_banners: parsed.promotion_banners as PromotionBanner[] | undefined,
        }

        // Update database. If rollout-dependent columns are missing in the
        // current environment, retry once with those fields omitted so
        // the rest of branding still persists.
        const { error: firstError } = await supabase
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
            const { error: fallbackError } = await supabase
                .from('tenants')
                .update(fallbackPayload as unknown as never)
                .eq('id', tenantId)
                .select('id')
                .single()

            if (!fallbackError) {
                error = null
                skippedFields = [...ROLLOUT_DEPENDENT_FIELDS]
                warning = 'Saved core branding, but layout/checkout settings were skipped until database migrations are applied.'
                console.warn('[saveBrandingAction] Saved with skipped rollout fields:', skippedFields)
            } else {
                error = fallbackError
            }
        }

        if (error) {
            console.error('[saveBrandingAction] Database error:', error)
            return { success: false, error: error.message }
        }

        // Revalidate all affected pages for instant updates
        // Using 'layout' type revalidates the route and all its children
        revalidatePath(`/${tenantSlug}/menu`, 'layout')
        revalidatePath(`/${tenantSlug}/admin/settings`)

        console.log(`[saveBrandingAction] Branding saved and cache revalidated for ${tenantSlug}`)

        return { success: true, warning, skippedFields }
    } catch (error) {
        console.error('[saveBrandingAction] Error:', error)

        if (error instanceof z.ZodError) {
            return { success: false, error: `Validation error: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}` }
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
    }
}
