/**
 * Server-side service layer for bundle operations
 * Uses server-side Supabase client with RLS policies
 */

import { createClient } from '@/lib/supabase/server'
import { verifyTenantAdmin } from '@/lib/admin-service'
import type { Bundle, BundleItem, MenuItem } from '@/types/database'
import { z } from 'zod'

// ============================================
// Types & Schemas
// ============================================

export const bundleItemInputSchema = z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().int().min(1).default(1),
    display_order: z.number().int().min(0).default(0),
})

export const bundleSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    description: z.string().optional().nullable(),
    image_url: z.string().url('Must be a valid URL').or(z.literal('')),
    pricing_type: z.enum(['fixed', 'discount']),
    fixed_price: z.number().min(0).optional().nullable(),
    discount_percent: z.number().min(1).max(100).optional().nullable(),
    is_active: z.boolean().default(true),
    show_on_menu: z.boolean().default(false),
    show_as_upsell: z.boolean().default(false),
    display_order: z.number().int().min(0).default(0),
    items: z.array(bundleItemInputSchema).min(1, 'Bundle must contain at least one item'),
})

export type BundleInput = z.infer<typeof bundleSchema>

// ============================================
// Bundle with items helper type
// ============================================

export interface BundleWithItems extends Bundle {
    items: (BundleItem & { menu_item: MenuItem })[]
}

// ============================================
// Admin Operations (require auth)
// ============================================

/**
 * Get all bundles for a tenant (admin view — includes inactive)
 */
export async function getBundlesByTenant(tenantId: string): Promise<BundleWithItems[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bundles')
        .select(`
      *,
      items:bundle_items(
        *,
        menu_item:menu_items(*)
      )
    `)
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true })

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? []
}

/**
 * Get a single bundle by ID with items
 */
export async function getBundleById(bundleId: string, tenantId: string): Promise<BundleWithItems> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bundles')
        .select(`
      *,
      items:bundle_items(
        *,
        menu_item:menu_items(*)
      )
    `)
        .eq('id', bundleId)
        .eq('tenant_id', tenantId)
        .single()

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any
}

/**
 * Create a new bundle with items
 */
export async function createBundle(tenantId: string, input: BundleInput): Promise<BundleWithItems> {
    await verifyTenantAdmin(tenantId)
    const validated = bundleSchema.parse(input)
    const supabase = await createClient()

    const { items, ...bundleData } = validated

    // Create the bundle
    const { data: bundle, error: bundleError } = await supabase
        .from('bundles')
        .insert({
            tenant_id: tenantId,
            name: bundleData.name,
            description: bundleData.description,
            image_url: bundleData.image_url,
            pricing_type: bundleData.pricing_type,
            fixed_price: bundleData.pricing_type === 'fixed' ? bundleData.fixed_price : null,
            discount_percent: bundleData.pricing_type === 'discount' ? bundleData.discount_percent : null,
            is_active: bundleData.is_active,
            show_on_menu: bundleData.show_on_menu,
            show_as_upsell: bundleData.show_as_upsell,
            display_order: bundleData.display_order,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select()
        .single()

    if (bundleError) throw bundleError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bundleRecord = bundle as any

    // Insert bundle items
    const bundleItems = items.map((item, index) => ({
        bundle_id: bundleRecord.id,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        display_order: item.display_order ?? index,
    }))

    const { error: itemsError } = await supabase
        .from('bundle_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(bundleItems as any)

    if (itemsError) throw itemsError

    // Return the full bundle with items
    return getBundleById(bundleRecord.id, tenantId)
}

/**
 * Update an existing bundle and its items
 */
export async function updateBundle(
    bundleId: string,
    tenantId: string,
    input: BundleInput
): Promise<BundleWithItems> {
    await verifyTenantAdmin(tenantId)
    const validated = bundleSchema.parse(input)
    const supabase = await createClient()

    const { items, ...bundleData } = validated

    // Update the bundle
    const { error: bundleError } = await supabase
        .from('bundles')
        .update({
            name: bundleData.name,
            description: bundleData.description,
            image_url: bundleData.image_url,
            pricing_type: bundleData.pricing_type,
            fixed_price: bundleData.pricing_type === 'fixed' ? bundleData.fixed_price : null,
            discount_percent: bundleData.pricing_type === 'discount' ? bundleData.discount_percent : null,
            is_active: bundleData.is_active,
            show_on_menu: bundleData.show_on_menu,
            show_as_upsell: bundleData.show_as_upsell,
            display_order: bundleData.display_order,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq('id', bundleId)
        .eq('tenant_id', tenantId)

    if (bundleError) throw bundleError

    // Delete existing bundle items and re-insert
    const { error: deleteError } = await supabase
        .from('bundle_items')
        .delete()
        .eq('bundle_id', bundleId)

    if (deleteError) throw deleteError

    const bundleItems = items.map((item, index) => ({
        bundle_id: bundleId,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        display_order: item.display_order ?? index,
    }))

    const { error: itemsError } = await supabase
        .from('bundle_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(bundleItems as any)

    if (itemsError) throw itemsError

    return getBundleById(bundleId, tenantId)
}

/**
 * Delete a bundle
 */
export async function deleteBundle(bundleId: string, tenantId: string): Promise<void> {
    await verifyTenantAdmin(tenantId)
    const supabase = await createClient()

    const { error } = await supabase
        .from('bundles')
        .delete()
        .eq('id', bundleId)
        .eq('tenant_id', tenantId)

    if (error) throw error
}

/**
 * Toggle bundle active status
 */
export async function toggleBundleActive(
    bundleId: string,
    tenantId: string,
    isActive: boolean
): Promise<Bundle> {
    await verifyTenantAdmin(tenantId)
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bundles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_active: isActive } as any)
        .eq('id', bundleId)
        .eq('tenant_id', tenantId)
        .select()
        .single()

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any
}

/**
 * Reorder bundles
 */
export async function reorderBundles(tenantId: string, bundleIds: string[]): Promise<void> {
    await verifyTenantAdmin(tenantId)
    const supabase = await createClient()

    const updates = bundleIds.map((id, index) =>
        supabase
            .from('bundles')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ display_order: index } as any)
            .eq('id', id)
            .eq('tenant_id', tenantId)
    )

    await Promise.all(updates)
}

// ============================================
// Public Operations (no auth required)
// ============================================

/**
 * Get active bundles visible on the menu for a tenant
 */
export async function getMenuBundles(tenantId: string): Promise<BundleWithItems[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bundles')
        .select(`
      *,
      items:bundle_items(
        *,
        menu_item:menu_items(*)
      )
    `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('show_on_menu', true)
        .order('display_order', { ascending: true })

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? []
}

/**
 * Get active bundles available as upsell suggestions
 */
export async function getUpsellBundles(tenantId: string): Promise<BundleWithItems[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bundles')
        .select(`
      *,
      items:bundle_items(
        *,
        menu_item:menu_items(*)
      )
    `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('show_as_upsell', true)
        .order('display_order', { ascending: true })

    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]) ?? []
}
