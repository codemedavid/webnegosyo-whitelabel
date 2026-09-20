/**
 * Server-side service layer for bundle operations
 * Uses admin Supabase client (bypasses RLS) with slot-based model
 */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTenantPermission } from '@/lib/admin-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { ImageSource } from '@/lib/image-source'
import { getCachedOrFetch, invalidateCache, generateCacheKey, CACHE_TTL } from '@/lib/redis-cache'
import type { Bundle, BundleWithSlots, MenuItem, Category } from '@/types/database'

// Re-export for backward compatibility with downstream consumers
export type { BundleWithSlots }
/** @deprecated Use BundleWithSlots instead */
export type BundleWithItems = BundleWithSlots

// ============================================
// Types & Schemas
// ============================================

export const bundleSlotPriceOverrideInputSchema = z.object({
  menu_item_id: z.string().uuid(),
  price_override: z.number().min(0),
})

export const bundleSlotInputSchema = z.object({
  name: z.string().min(1, 'Slot name is required'),
  category_id: z.string().uuid('Must select a category'),
  pick_count: z.number().int().min(1, 'Must pick at least 1 item').default(1),
  sort_order: z.number().int().min(0).default(0),
  included_item_ids: z.array(z.string().uuid()).optional().nullable(),
  price_overrides: z.array(bundleSlotPriceOverrideInputSchema).default([]),
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
  slots: z.array(bundleSlotInputSchema).min(1, 'Bundle must have at least one slot'),
})

export type BundleInput = z.infer<typeof bundleSchema>

/**
 * Row-only fields of a bundle (no slots), all optional and WITHOUT defaults.
 * Written out rather than derived: zod keeps `.default()` values through
 * `.partial()`, so a derived patch schema would silently reset is_active /
 * show_on_menu / display_order on a payload that only renamed the bundle.
 */
export const bundleFieldsPatchSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  description: z.string().optional().nullable(),
  image_url: z.string().url('Must be a valid URL').or(z.literal('')).optional(),
  pricing_type: z.enum(['fixed', 'discount']).optional(),
  fixed_price: z.number().min(0).optional().nullable(),
  discount_percent: z.number().min(1).max(100).optional().nullable(),
  is_active: z.boolean().optional(),
  show_on_menu: z.boolean().optional(),
  show_as_upsell: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
})
export type BundleFieldsPatch = z.infer<typeof bundleFieldsPatchSchema>

/**
 * The `bundles` columns a validated input maps to. Pricing columns that do not
 * belong to the chosen pricing_type are nulled so a switch from discount to
 * fixed never leaves a stale percent behind.
 */
export function toBundleRow(fields: BundleFieldsPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const assign = (key: keyof BundleFieldsPatch) => {
    if (fields[key] !== undefined) row[key] = fields[key]
  }
  ;(['name', 'description', 'image_url', 'is_active', 'show_on_menu', 'show_as_upsell', 'display_order'] as const).forEach(assign)

  if (fields.pricing_type !== undefined) {
    row.pricing_type = fields.pricing_type
    row.fixed_price = fields.pricing_type === 'fixed' ? fields.fixed_price ?? null : null
    row.discount_percent = fields.pricing_type === 'discount' ? fields.discount_percent ?? null : null
  } else {
    assign('fixed_price')
    assign('discount_percent')
  }
  return row
}

// ============================================
// Query constant
// ============================================

const BUNDLE_SLOTS_QUERY = `
  *,
  slots:bundle_slots(
    *,
    category:categories(id, name, icon, icon_color),
    price_overrides:bundle_slot_price_overrides(*)
  )
`

// ============================================
// Admin Operations (require auth)
// ============================================

/**
 * Get all bundles for a tenant (admin view — includes inactive)
 */
export async function getBundlesByTenant(tenantId: string): Promise<BundleWithSlots[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  if (error) throw error
  return (data as unknown as BundleWithSlots[]) ?? []
}

/**
 * Get a single bundle by ID with slots
 */
export async function getBundleById(bundleId: string, tenantId: string): Promise<BundleWithSlots> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bundles')
    .select(BUNDLE_SLOTS_QUERY)
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as unknown as BundleWithSlots
}

/**
 * Create a new bundle with slots
 */
export async function createBundle(tenantId: string, input: BundleInput, ctx?: ProvisioningCtx): Promise<BundleWithSlots> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = bundleSchema.parse(input)
  const supabase = ctx?.client ?? createAdminClient()

  const { slots, ...bundleData } = validated

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

  // Insert slots and their price overrides sequentially
  for (const slot of slots) {
    const { price_overrides, ...slotData } = slot

    const { data: insertedSlot, error: slotError } = await supabase
      .from('bundle_slots')
      .insert({
        bundle_id: bundleRecord.id,
        name: slotData.name,
        category_id: slotData.category_id,
        pick_count: slotData.pick_count,
        sort_order: slotData.sort_order,
        included_item_ids: slotData.included_item_ids ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select()
      .single()

    if (slotError) throw slotError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slotRecord = insertedSlot as any

    if (price_overrides.length > 0) {
      const overrides = price_overrides.map((po) => ({
        slot_id: slotRecord.id,
        menu_item_id: po.menu_item_id,
        price_override: po.price_override,
      }))

      const { error: overridesError } = await supabase
        .from('bundle_slot_price_overrides')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(overrides as any)

      if (overridesError) throw overridesError
    }
  }

  return getBundleById(bundleRecord.id, tenantId)
}

/**
 * Update an existing bundle and its slots
 */
export async function updateBundle(
  bundleId: string,
  tenantId: string,
  input: BundleInput,
  ctx?: ProvisioningCtx
): Promise<BundleWithSlots> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = bundleSchema.parse(input)
  const supabase = ctx?.client ?? createAdminClient()

  const { slots, ...bundleData } = validated

  // Update the bundle row
  const { error: bundleError } = await supabase
    .from('bundles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(toBundleRow(bundleData) as any)
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)

  if (bundleError) throw bundleError

  // Delete existing slots — cascades to bundle_slot_price_overrides
  const { error: deleteError } = await supabase
    .from('bundle_slots')
    .delete()
    .eq('bundle_id', bundleId)

  if (deleteError) throw deleteError

  // Re-insert all slots and their price overrides
  for (const slot of slots) {
    const { price_overrides, ...slotData } = slot

    const { data: insertedSlot, error: slotError } = await supabase
      .from('bundle_slots')
      .insert({
        bundle_id: bundleId,
        name: slotData.name,
        category_id: slotData.category_id,
        pick_count: slotData.pick_count,
        sort_order: slotData.sort_order,
        included_item_ids: slotData.included_item_ids ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select()
      .single()

    if (slotError) throw slotError

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slotRecord = insertedSlot as any

    if (price_overrides.length > 0) {
      const overrides = price_overrides.map((po) => ({
        slot_id: slotRecord.id,
        menu_item_id: po.menu_item_id,
        price_override: po.price_override,
      }))

      const { error: overridesError } = await supabase
        .from('bundle_slot_price_overrides')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(overrides as any)

      if (overridesError) throw overridesError
    }
  }

  return getBundleById(bundleId, tenantId)
}

/**
 * Partial update of a bundle's own row — never touches slots. The MCP path for
 * "rename it / change the price / hide it" where re-sending every slot would
 * be both tedious and a chance to lose one.
 */
export async function updateBundleFields(
  bundleId: string,
  tenantId: string,
  patch: BundleFieldsPatch,
  ctx?: ProvisioningCtx
): Promise<BundleWithSlots> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const validated = bundleFieldsPatchSchema.parse(patch)
  const row = toBundleRow(validated)
  if (Object.keys(row).length === 0) throw new Error('No bundle fields to update')

  const supabase = ctx?.client ?? createAdminClient()
  const { error } = await supabase
    .from('bundles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(row as any)
    .eq('id', bundleId)
    .eq('tenant_id', tenantId)
  if (error) throw error

  return getBundleById(bundleId, tenantId)
}

/**
 * Host an image (bytes or link) on ImageKit and set it as the bundle's image.
 * Upload is awaited first, so a failed ingest leaves the row untouched.
 */
export async function setBundleImage(
  bundleId: string,
  tenantId: string,
  source: ImageSource,
  ctx?: ProvisioningCtx
): Promise<BundleWithSlots> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  // Lazy: keeps the server-only upload chain out of client bundles.
  const { ingestImage } = await import('@/lib/image-ingest')
  const { url } = await ingestImage(source, `bundles/${tenantId}`)
  return updateBundleFields(bundleId, tenantId, { image_url: url }, ctx)
}

/**
 * Delete a bundle (cascades to bundle_slots and bundle_slot_price_overrides)
 */
export async function deleteBundle(bundleId: string, tenantId: string): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = createAdminClient()

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
  isActive: boolean,
  ctx?: ProvisioningCtx
): Promise<Bundle> {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')
  const supabase = ctx?.client ?? createAdminClient()

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
 * Reorder bundles by setting display_order from array position
 */
export async function reorderBundles(tenantId: string, bundleIds: string[]): Promise<void> {
  await verifyTenantPermission(tenantId, 'menu')
  const supabase = createAdminClient()

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
 * Get active bundles visible on the menu for a tenant (Redis-cached, 5 min TTL)
 */
export async function getMenuBundles(tenantId: string): Promise<BundleWithSlots[]> {
  const cacheKey = generateCacheKey('bundles:menu', tenantId)

  return getCachedOrFetch(
    cacheKey,
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('bundles')
        .select(BUNDLE_SLOTS_QUERY)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('show_on_menu', true)
        .order('display_order', { ascending: true })

      if (error) throw error
      const bundles = (data as unknown as BundleWithSlots[]) ?? []
      return bundles.filter((b) => b.slots && b.slots.length > 0)
    },
    CACHE_TTL.BUNDLES
  )
}

/**
 * Get active bundles available as upsell suggestions (Redis-cached, 5 min TTL)
 */
export async function getUpsellBundles(tenantId: string): Promise<BundleWithSlots[]> {
  const cacheKey = generateCacheKey('bundles:upsell', tenantId)

  return getCachedOrFetch(
    cacheKey,
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('bundles')
        .select(BUNDLE_SLOTS_QUERY)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .eq('show_as_upsell', true)
        .order('display_order', { ascending: true })

      if (error) throw error
      const bundles = (data as unknown as BundleWithSlots[]) ?? []
      return bundles.filter((b) => b.slots && b.slots.length > 0)
    },
    CACHE_TTL.BUNDLES
  )
}

/**
 * Invalidate all bundle caches for a tenant.
 * Call after any bundle create/update/delete/toggle.
 */
export async function invalidateBundlesCache(tenantId: string): Promise<void> {
  await Promise.all([
    invalidateCache(generateCacheKey('bundles:menu', tenantId)),
    invalidateCache(generateCacheKey('bundles:upsell', tenantId)),
  ])
}

// ============================================
// Slot helpers
// ============================================

/**
 * Fetch the available menu items and category metadata for a given bundle slot.
 * When includedItemIds is provided, returns only those specific items (may span categories).
 * Otherwise falls back to all items from the category.
 */
export async function getSlotItems(
  categoryId: string,
  tenantId: string,
  includedItemIds?: string[] | null
): Promise<{ items: MenuItem[]; category: Category }> {
  const supabase = createAdminClient()

  const itemsQuery = includedItemIds && includedItemIds.length > 0
    ? supabase
        .from('menu_items')
        .select('*')
        .in('id', includedItemIds)
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .order('order', { ascending: true })
    : supabase
        .from('menu_items')
        .select('*')
        .eq('category_id', categoryId)
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .order('order', { ascending: true })

  const [{ data: items, error: itemsError }, { data: category, error: catError }] =
    await Promise.all([
      itemsQuery,
      supabase.from('categories').select('*').eq('id', categoryId).single(),
    ])

  if (itemsError) throw new Error(`Failed to fetch slot items: ${itemsError.message}`)
  if (catError) throw new Error(`Failed to fetch category: ${catError.message}`)

  return { items: (items ?? []) as unknown as MenuItem[], category: category as unknown as Category }
}

/**
 * List a tenant's bundles for provisioning flows (the MCP), so the caller can
 * see what already exists before creating a near-duplicate. Uses the
 * service-role `ctx` client when provided, like `createBundle` above.
 */
export async function listBundlesForProvisioning(tenantId: string, ctx?: ProvisioningCtx) {
  const supabase = ctx?.client ?? createAdminClient()

  const { data, error } = await supabase
    .from('bundles')
    .select(
      'id, name, description, image_url, pricing_type, fixed_price, discount_percent, is_active, show_on_menu, show_as_upsell, display_order, slots:bundle_slots(id, name, category_id, pick_count, sort_order, included_item_ids)'
    )
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data
}
