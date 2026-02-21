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

/**
 * Save branding settings and revalidate cached pages for instant updates.
 * This server action ensures that branding changes appear immediately
 * without requiring a page refresh or waiting for cache TTL to expire.
 */
export async function saveBrandingAction(
    tenantId: string,
    tenantSlug: string,
    branding: BrandingInput
): Promise<{ success: boolean; error?: string }> {
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

        // Update database
        const { error } = await supabase
            .from('tenants')
            // Cast through unknown to satisfy strict generic constraints
            .update(updatePayload as unknown as never)
            .eq('id', tenantId)

        if (error) {
            console.error('[saveBrandingAction] Database error:', error)
            return { success: false, error: error.message }
        }

        // Revalidate all affected pages for instant updates
        // Using 'layout' type revalidates the route and all its children
        revalidatePath(`/${tenantSlug}/menu`, 'layout')
        revalidatePath(`/${tenantSlug}/admin/settings`)

        console.log(`[saveBrandingAction] Branding saved and cache revalidated for ${tenantSlug}`)

        return { success: true }
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
