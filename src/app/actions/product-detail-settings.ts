'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'
import { DEFAULT_PRODUCT_DETAIL_SETTINGS } from '@/lib/product-detail-theme'
import { stripToDBColumns } from '@/lib/product-detail-settings-utils'

interface ActionResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
}

async function checkAuthorization(tenantId: string): Promise<{ authorized: boolean; error?: string }> {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        return { authorized: false, error: 'Unauthorized: No user session' }
    }
    
    const { data: userRole } = await supabase
        .from('app_users')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .maybeSingle()
    
    if (!userRole) {
        return { authorized: false, error: 'Unauthorized: User role not found' }
    }
    
    const roleData = userRole as { role: string; tenant_id: string | null }
    const isSuperAdmin = roleData.role === 'superadmin'
    const isTenantAdmin = roleData.role === 'admin' && roleData.tenant_id === tenantId
    
    if (!isSuperAdmin && !isTenantAdmin) {
        return { authorized: false, error: 'Unauthorized: Insufficient permissions' }
    }
    
    return { authorized: true }
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

export async function saveProductDetailSettings(
    tenantId: string,
    tenantSlug: string,
    settings: Partial<ProductDetailSettings>
): Promise<ActionResult> {
    try {
        // Check authorization first
        const auth = await checkAuthorization(tenantId)
        if (!auth.authorized) {
            return { success: false, error: auth.error }
        }
        
        const supabase = await createClient()
        
        // Use upsert to avoid race condition (check-then-act)
        const cleanSettings = stripToDBColumns(settings)
        const upsertData = { tenant_id: tenantId, ...cleanSettings }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from('product_detail_settings')
            .upsert(upsertData, { onConflict: 'tenant_id' })
            .select()
        
        if (error) {
            console.error('Error saving product detail settings:', error)
            return { success: false, error: error.message }
        }
        
        revalidatePath(`/${tenantSlug}/menu`, 'layout')
        revalidatePath(`/${tenantSlug}/admin`)
        revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')

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
    tenantSlug: string
): Promise<ActionResult<Partial<ProductDetailSettings>>> {
    try {
        // Check authorization first
        const auth = await checkAuthorization(tenantId)
        if (!auth.authorized) {
            return { success: false, error: auth.error }
        }
        
        const supabase = await createClient()
        
        const { error } = await supabase
            .from('product_detail_settings')
            .delete()
            .eq('tenant_id', tenantId)
        
        if (error) {
            console.error('Error resetting product detail settings:', error)
            return { success: false, error: error.message }
        }
        
        revalidatePath(`/${tenantSlug}/menu`, 'layout')
        revalidatePath(`/${tenantSlug}/admin`)
        revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')

        return { success: true, data: DEFAULT_PRODUCT_DETAIL_SETTINGS }
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to reset product detail settings' 
        }
    }
}
