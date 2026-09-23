'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import { DEFAULT_PRODUCT_DETAIL_SETTINGS } from '@/lib/product-detail-theme'
import { stripToDBColumns } from '@/lib/product-detail-settings-utils'
import { productDetailSettingsWriteSchema } from '@/lib/product-detail-settings-schema'
import { readTenantSlugById } from '@/lib/tenant-revalidation'

interface ActionResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
}

/**
 * Purge the product pages under the slug STORED for the authorized tenant.
 * The slug argument the client sends is ignored: `[tenant]` would purge every
 * tenant's storefront. A failure here never fails the committed write.
 */
async function revalidateProductPages(tenantId: string): Promise<void> {
    try {
        const slug = await readTenantSlugById(createAdminClient(), tenantId)
        if (!slug) {
            console.warn(`[product-detail-settings] Saved for ${tenantId}, but caches were not refreshed (no usable slug)`)
            return
        }
        revalidatePath(`/${slug}/menu`, 'layout')
        revalidatePath(`/${slug}/admin`)
        revalidatePath(`/${slug}/menu/item/[itemId]`, 'page')
    } catch (error) {
        console.warn('[product-detail-settings] Saved, but cache refresh failed:', error)
    }
}

function formatIssues(error: z.ZodError): string {
    return error.issues
        .map((issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message))
        .join(', ')
}

export async function getProductDetailSettings(tenantId: string): Promise<ActionResult<ProductDetailSettings | null>> {
    try {
        const supabase = await createClient()
        
        const { data, error } = await supabase
            .from('product_detail_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .maybeSingle()
        
        if (error) {
            console.error('Error fetching product detail settings:', error)
            return { success: false, error: error.message }
        }
        
        return { success: true, data: data as unknown as ProductDetailSettings | null }
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to fetch product detail settings' 
        }
    }
}

/**
 * `_tenantSlug` is accepted for call-site compatibility and ignored (see
 * revalidateProductPages). Requires `store_setup`, like branding.
 */
export async function saveProductDetailSettings(
    tenantId: string,
    _tenantSlug: string,
    settings: Partial<ProductDetailSettings>
): Promise<ActionResult> {
    try {
        await verifyTenantPermission(tenantId, 'store_setup')

        const parsed = productDetailSettingsWriteSchema.safeParse(stripToDBColumns(settings))
        if (!parsed.success) {
            return { success: false, error: `Validation error: ${formatIssues(parsed.error)}` }
        }

        const supabase = await createClient()

        // Use upsert to avoid race condition (check-then-act). tenant_id is
        // spread LAST and is not in the schema, so the payload cannot retarget
        // the row at another tenant.
        const upsertData = { ...parsed.data, tenant_id: tenantId }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from('product_detail_settings')
            .upsert(upsertData, { onConflict: 'tenant_id' })
            .select()
        
        if (error) {
            console.error('Error saving product detail settings:', error)
            return { success: false, error: error.message }
        }
        
        await revalidateProductPages(tenantId)

        return { success: true, data }
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to save product detail settings' 
        }
    }
}

export async function resetProductDetailSettings(
    tenantId: string,
    // Kept for call-site compatibility; ignored (see revalidateProductPages).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tenantSlug: string
): Promise<ActionResult<Partial<ProductDetailSettings>>> {
    try {
        await verifyTenantPermission(tenantId, 'store_setup')

        const supabase = await createClient()
        
        const { error } = await supabase
            .from('product_detail_settings')
            .delete()
            .eq('tenant_id', tenantId)
        
        if (error) {
            console.error('Error resetting product detail settings:', error)
            return { success: false, error: error.message }
        }
        
        await revalidateProductPages(tenantId)

        return { success: true, data: DEFAULT_PRODUCT_DETAIL_SETTINGS }
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to reset product detail settings' 
        }
    }
}
