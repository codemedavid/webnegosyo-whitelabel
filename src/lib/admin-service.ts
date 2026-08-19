/**
 * Server-side service layer for tenant admin operations
 * Uses server-side Supabase client with RLS policies
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Category, MenuItem } from '@/types/database'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import {
  canManageStaff,
  hasPermission,
  type StaffPermissionKey,
} from '@/lib/staff-permissions'
import {
  asAppUserQueryClient,
  fetchAppUserScope,
} from '@/lib/queries/fetch-app-user-scope'
import { canManageBranchStaff } from '@/lib/outlets/branch-scope'
import { assertSubscriptionActive } from '@/lib/billing/subscription-gate'
import { fetchSubscription } from '@/lib/billing/subscription-repository'
import { z } from 'zod'

// ============================================
// Types & Schemas
// ============================================

export const categorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  icon: z.string().optional(),
  icon_color: z.string().optional(),
  order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  display_layout: z.enum(['grid', 'horizontal_scroll', 'horizontal_mobile_only', 'horizontal_desktop_only']).default('grid'),
  // Per-category card template override; null clears back to the tenant template.
  card_template: z.string().nullable().optional(),
  default_addons: z.array(z.object({
    id: z.string(),
    name: z.string().min(1, 'Add-on name is required'),
    price: z.number().min(0, 'Price must be non-negative'),
  })).optional().default([]),
})

// New variation type schema
export const variationOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Option name is required'),
  price_modifier: z.number(),
  image_url: z.string().url('Must be a valid URL').optional().nullable(),
  is_default: z.boolean().optional(),
  is_upgrade_target: z.boolean().optional(),
  display_order: z.number().int().min(0),
})

export const variationTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Type name is required'),
  is_required: z.boolean(),
  display_order: z.number().int().min(0),
  options: z.array(variationOptionSchema).min(1, 'At least one option is required'),
})

// Unified modifier groups (supersedes variation_types + addons). Each option
// carries a price modifier plus optional per-option cost and stock. Legacy
// columns are kept synced by the editor for backward compatibility.
export const modifierOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Option name is required'),
  price_modifier: z.number(),
  image_url: z.string().url('Must be a valid URL').optional().nullable(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0),
  manual_cost: z.number().min(0).optional(),
  stock_mode: z.enum(['none', 'simple', 'recipe']).optional(),
  stock_qty: z.number().min(0).optional(),
  is_available: z.boolean().optional(),
})

export const modifierGroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Group name is required'),
  display_order: z.number().int().min(0),
  min_select: z.number().int().min(0),
  max_select: z.number().int().min(1).nullable(),
  options: z.array(modifierOptionSchema).min(1, 'At least one option is required'),
})

export const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be positive'),
  discounted_price: z.number().positive().optional().nullable(),
  // Image is optional — a product can be saved without one. Accept a valid
  // delivery URL or an empty string; missing values normalize to ''.
  image_url: z.string().url('Must be a valid URL').or(z.literal('')).optional().default(''),
  category_id: z.string().uuid('Must select a category'),
  // Unified modifier groups (new canonical model; empty = derive from legacy)
  modifier_groups: z.array(modifierGroupSchema).optional().default([]),
  // New grouped variation types
  variation_types: z.array(variationTypeSchema).optional().default([]),
  // Legacy variations (kept for backward compatibility)
  variations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price_modifier: z.number(),
    is_default: z.boolean().optional(),
  })).optional().default([]),
  addons: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })).default([]),
  is_available: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  bcg_classification: z.enum(['star', 'plowhorse', 'puzzle', 'dog', 'unclassified']).optional().default('unclassified'),
  badge_text: z.string().nullable().optional(),
  show_in_checkout_upsell: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
})

/**
 * Partial-update schema for a menu item: every field optional and NO defaults, so
 * omitting a field leaves that column untouched (unlike menuItemSchema, whose
 * `.default()`s would overwrite columns on a partial write). Deep field rules
 * (min lengths, nested variation shapes) are reused from menuItemSchema's parts.
 * Used by updateMenuItemFields (the MCP `update_menu_item` op).
 */
export const menuItemUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be positive'),
  discounted_price: z.number().positive().nullable(),
  image_url: z.string().url('Must be a valid URL').or(z.literal('')),
  category_id: z.string().uuid('Must select a category'),
  variation_types: z.array(variationTypeSchema),
  variations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price_modifier: z.number(),
    is_default: z.boolean().optional(),
  })),
  addons: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })),
  is_available: z.boolean(),
  is_featured: z.boolean(),
  bcg_classification: z.enum(['star', 'plowhorse', 'puzzle', 'dog', 'unclassified']),
  badge_text: z.string().nullable(),
  show_in_checkout_upsell: z.boolean(),
  order: z.number().int().min(0),
}).partial()

export type CategoryInput = z.infer<typeof categorySchema>
export type MenuItemInput = z.input<typeof menuItemSchema>
export type MenuItemUpdateInput = z.input<typeof menuItemUpdateSchema>

// ============================================
// Authentication & Authorization
// ============================================

/**
 * Verify user is authenticated and has admin access to the tenant
 */
export async function verifyTenantAdmin(tenantId: string) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error('Unauthorized: Not authenticated')
  }

  // Check if user is admin of this tenant or superadmin. Read through the
  // resilient helper: naming the branch column here before its migration is
  // applied would 400 every admin action, not just the branch feature.
  const { appUser, error: roleError } = await fetchAppUserScope(
    asAppUserQueryClient(supabase),
    user.id
  )

  if (roleError || !appUser) {
    throw new Error('Unauthorized: User role not found')
  }

  const userRole: {
    role: string
    tenant_id: string | null
    is_owner?: boolean | null
    permissions?: string[] | null
    outlet_id?: string | null
  } = appUser

  const isAuthorized =
    userRole.role === 'superadmin' ||
    (userRole.role === 'admin' && userRole.tenant_id === tenantId)

  if (!isAuthorized) {
    throw new Error('Unauthorized: Not admin of this tenant')
  }

  // The subscription boundary, and the reason it lives HERE rather than in each
  // action: the admin layout's redirect is a rendering decision that does not
  // stop a POST aimed straight at a server action, and `assertSubscriptionActive`
  // was written for that job but never called from anywhere — a sign on an
  // unlocked door. Every admin write in the product passes through this
  // function, so one call closes all of them and none can be forgotten later.
  //
  // A superadmin is exempt inside the assertion: they are the only account that
  // can clear an unpaid subscription, and a gate that locks out its own remedy
  // cannot be fixed from inside the product.
  //
  // Fails OPEN by construction — `fetchSubscription` returns null on any query
  // error and null reads as "not blocked", so a database blip leaves merchants
  // working instead of locking out the whole platform at once.
  assertSubscriptionActive(
    await fetchSubscription(supabase, tenantId),
    { role: userRole.role }
  )

  return { user, userRole }
}

/**
 * Verify the caller is admin of the tenant AND holds the given feature
 * permission (owners, superadmins, and legacy null-permission admins pass).
 */
export async function verifyTenantPermission(
  tenantId: string,
  permission: StaffPermissionKey
) {
  const result = await verifyTenantAdmin(tenantId)
  if (!hasPermission(result.userRole, permission)) {
    throw new Error('Unauthorized: Missing permission for this feature')
  }
  return result
}

/**
 * Verify the caller is the tenant owner (or a superadmin). Required for
 * staff management and credential settings.
 */
export async function verifyTenantOwner(tenantId: string) {
  const result = await verifyTenantAdmin(tenantId)
  if (!canManageStaff(result.userRole)) {
    throw new Error('Unauthorized: Only the store owner can manage this')
  }
  return result
}

/**
 * Verify the caller may manage staff accounts: the tenant owner, a superadmin,
 * or a branch admin — an account confined to one branch that holds
 * `branch_staff`, and may manage only that branch's people.
 *
 * The service layer re-checks the specific branch on every write
 * (`staff-service.ts`); this only establishes that the caller manages staff at
 * all.
 */
export async function verifyStaffManager(tenantId: string) {
  const result = await verifyTenantAdmin(tenantId)
  const isOwner = canManageStaff(result.userRole)
  const isBranchAdmin = canManageBranchStaff(
    result.userRole,
    result.userRole.outlet_id ?? null
  )

  if (!isOwner && !isBranchAdmin) {
    throw new Error('Unauthorized: Only the store owner can manage this')
  }

  return result
}

/**
 * Get current authenticated user's role info
 */
export async function getCurrentUserRole() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return null
  }

  const { data: userRole } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return userRole
}

// ============================================
// Categories Operations
// ============================================

export const getCategoriesByTenant = cache(async (tenantId: string) => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (error) throw error
  return data as unknown as Category[]
})

export async function createCategory(tenantId: string, input: CategoryInput, ctx?: ProvisioningCtx) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  const validated = categorySchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('categories')
    .insert({
      tenant_id: tenantId,
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Category
}

export async function updateCategory(categoryId: string, tenantId: string, input: CategoryInput) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const validated = categorySchema.parse(input)
  const supabase = await createClient()

  const query = supabase
    .from('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(validated as any)
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as unknown as Category
}

export async function deleteCategory(categoryId: string, tenantId: string) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const supabase = await createClient()

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function reorderCategories(tenantId: string, categoryIds: string[]) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const supabase = await createClient()

  // Update order for each category
  const updates = categoryIds.map((id, index) => 
    supabase
      .from('categories')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ order: index } as any)
      .eq('id', id)
      .eq('tenant_id', tenantId)
  )

  await Promise.all(updates)
}

// ============================================
// Menu Items Operations
// ============================================

export interface MenuItemsPaginationParams {
  page?: number
  limit?: number
  categoryId?: string
  searchQuery?: string
  isAvailable?: boolean
}

export interface PaginatedMenuItemsResult {
  items: MenuItem[]
  totalCount: number
  currentPage: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// Function overloads for better type inference
export async function getMenuItemsByTenant(
  tenantId: string
): Promise<MenuItem[]>
export async function getMenuItemsByTenant(
  tenantId: string,
  params: MenuItemsPaginationParams
): Promise<PaginatedMenuItemsResult>
export async function getMenuItemsByTenant(
  tenantId: string,
  params?: MenuItemsPaginationParams
): Promise<MenuItem[] | PaginatedMenuItemsResult> {
  const supabase = await createClient()
  
  // If no pagination params provided, return all items (legacy behavior)
  if (!params) {
    const { data, error } = await supabase
      .from('menu_items')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('tenant_id', tenantId)
      .order('order', { ascending: true })

    if (error) throw error
    return data as unknown as MenuItem[]
  }

  // Pagination logic
  const page = params.page || 1
  const limit = params.limit || 24
  const offset = (page - 1) * limit

  // Build query with filters
  let query = supabase
    .from('menu_items')
    .select(`
      *,
      category:categories(*)
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)

  // Apply filters
  if (params.categoryId && params.categoryId !== 'all') {
    query = query.eq('category_id', params.categoryId)
  }

  if (params.searchQuery) {
    // Sanitize search query to prevent PostgREST filter injection
    // Escape all PostgREST-special characters: % _ \ * , . ( ) ! = < >
    const sanitized = params.searchQuery
      .replace(/[%_\\*,.()\!=><!]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .slice(0, 100) // limit length
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
    }
  }

  if (params.isAvailable !== undefined) {
    query = query.eq('is_available', params.isAvailable)
  }

  // Apply pagination and ordering
  query = query
    .order('order', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) throw error

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / limit)

  return {
    items: data as unknown as MenuItem[],
    totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

export const getMenuItemById = cache(async (itemId: string, tenantId: string) => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as unknown as MenuItem
})

export async function createMenuItem(tenantId: string, input: MenuItemInput, ctx?: ProvisioningCtx) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  const validated = menuItemSchema.parse(input)
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      tenant_id: tenantId,
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variations: validated.variations as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addons: validated.addons as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modifier_groups: validated.modifier_groups as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as unknown as MenuItem
}

export async function updateMenuItem(itemId: string, tenantId: string, input: MenuItemInput) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const validated = menuItemSchema.parse(input)
  const supabase = await createClient()

  const query = supabase
    .from('menu_items')
    .update({
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variations: validated.variations as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addons: validated.addons as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modifier_groups: validated.modifier_groups as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as unknown as MenuItem
}

/**
 * Update ONLY the image of an existing menu item — a focused, partial write that
 * leaves every other column untouched (unlike updateMenuItem, which replaces the
 * whole record from a full MenuItemInput). Used by the remote MCP to point an
 * item at an already-hosted image URL; when a service-role `ctx` is supplied the
 * tenant-admin session check is skipped (the MCP is superadmin-authenticated).
 */
export async function updateMenuItemImage(
  itemId: string,
  tenantId: string,
  imageUrl: string,
  ctx?: ProvisioningCtx,
) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('menu_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ image_url: imageUrl } as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as MenuItem
}

/**
 * Partial update of an existing menu item: writes ONLY the fields provided
 * (name, description, price, variation_types, addons, ...) and leaves every other
 * column untouched. Unlike updateMenuItem (a full-record replace that needs a
 * complete MenuItemInput), this supports editing one attribute at a time — the
 * shape the remote MCP needs. When a service-role `ctx` is supplied the
 * tenant-admin session check is skipped (the MCP is superadmin-authenticated).
 */
export async function updateMenuItemFields(
  itemId: string,
  tenantId: string,
  input: MenuItemUpdateInput,
  ctx?: ProvisioningCtx,
) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  const validated = menuItemUpdateSchema.parse(input)
  // Drop undefined keys so omitted fields are never written (partial semantics).
  const patch = Object.fromEntries(
    Object.entries(validated).filter(([, value]) => value !== undefined),
  )
  if (Object.keys(patch).length === 0) {
    throw new Error('No fields provided to update')
  }

  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('menu_items')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as MenuItem
}

/**
 * Upload raw base64 image bytes to ImageKit, then set the resulting hosted URL on
 * the menu item. This is the MCP path for clients that generate an image file but
 * have no hosting of their own (the URL-only `updateMenuItemImage` cannot serve
 * them). The upload is awaited first: if it throws, the row is never touched.
 */
export async function setMenuItemImageFromData(
  itemId: string,
  tenantId: string,
  imageBase64: string,
  fileName: string,
  ctx?: ProvisioningCtx,
) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  // Lazily import so the `server-only` upload module is not pulled into any
  // client bundle that transitively imports this service.
  const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')
  const { url } = await uploadBase64ToImageKit(imageBase64, {
    folder: `menu-items/${tenantId}`,
    fileName,
  })

  return updateMenuItemImage(itemId, tenantId, url, ctx)
}

/**
 * Ingest an image that lives at a remote URL (a Drive/Dropbox share link, a
 * supplier CDN) into ImageKit, then point the menu item at the ImageKit URL. This
 * is the MCP path for "here is a link to the photo": storing the foreign URL via
 * `updateMenuItemImage` would leave the menu pointing at an HTML interstitial or
 * a link that later rots. Fetch and upload are awaited first, so a failure at
 * either step leaves the row untouched.
 */
export async function setMenuItemImageFromUrl(
  itemId: string,
  tenantId: string,
  sourceUrl: string,
  fileName?: string,
  ctx?: ProvisioningCtx,
) {
  if (!ctx) await verifyTenantPermission(tenantId, 'menu')

  // Lazily import so the `server-only` modules are not pulled into any client
  // bundle that transitively imports this service.
  const { fetchRemoteImageAsBase64 } = await import('@/lib/imagekit-remote')
  const { uploadBase64ToImageKit } = await import('@/lib/imagekit-server')

  const remote = await fetchRemoteImageAsBase64(sourceUrl, fileName)
  const { url } = await uploadBase64ToImageKit(remote.base64, {
    folder: `menu-items/${tenantId}`,
    fileName: remote.fileName,
  })

  return updateMenuItemImage(itemId, tenantId, url, ctx)
}

/**
 * List a tenant's categories (id, name, order) for provisioning flows so a caller
 * (e.g. the MCP) can resolve the `category_id` an item needs without guessing.
 * Uses the service-role `ctx` client when provided so it bypasses RLS the same
 * way the other MCP reads do.
 */
export async function listCategoriesForProvisioning(tenantId: string, ctx?: ProvisioningCtx) {
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, order, is_active')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (error) throw error
  return data
}

/**
 * List a tenant's menu items (id, name, image_url) for provisioning flows so a
 * caller (e.g. the MCP) can resolve an item by name before updating it. Uses the
 * service-role `ctx` client when provided so it bypasses RLS the same way the
 * other MCP reads do.
 */
export async function listMenuItemsForProvisioning(tenantId: string, ctx?: ProvisioningCtx) {
  const supabase = ctx?.client ?? (await createClient())

  const { data, error } = await supabase
    .from('menu_items')
    // description is included so callers can match items by a code (D1, SP1, ...)
    // that the merchant put in the description rather than the name.
    .select('id, name, description, image_url, category_id, price, is_available')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (error) throw error
  return data
}

export async function deleteMenuItem(itemId: string, tenantId: string) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const supabase = await createClient()

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function toggleMenuItemAvailability(itemId: string, tenantId: string, isAvailable: boolean) {
  await verifyTenantPermission(tenantId, 'menu')
  
  const supabase = await createClient()

  const query = supabase
    .from('menu_items')
    // Clearing `auto_disabled_at` hands ownership of this item's availability
    // back to the merchant. Auto-86 recovery only ever re-enables items still
    // carrying the marker, so leaving it set on a dish the merchant has just
    // decided about would let the next delivery overrule them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ is_available: isAvailable, auto_disabled_at: null } as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as unknown as MenuItem
}

// ============================================
// Public Menu (No auth required)
// ============================================

export async function getPublicMenuByTenant(tenantId: string) {
  const supabase = await createClient()
  
  // Get active categories with available menu items
  const { data, error } = await supabase
    .from('categories')
    .select(`
      *,
      menu_items:menu_items(*)
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('menu_items.is_available', true)
    .order('order', { ascending: true })

  if (error) throw error
  return data
}

export const getTenantBySlug = cache(async (slug: string) => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }

  return data
})


/**
 * Menu items offerable as linked add-on options, newest name order.
 *
 * Only the three fields the editor's picker needs — the storefront resolves the
 * live name/price/image itself at render time, so this is purely for choosing.
 */
export async function getLinkableMenuItems(
  tenantId: string
): Promise<{ id: string; name: string; price: number }[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price')
    .eq('tenant_id', tenantId)
    .order('name')

  if (error) {
    console.error('Error fetching linkable menu items:', error.message)
    return []
  }

  return (data ?? []) as { id: string; name: string; price: number }[]
}
