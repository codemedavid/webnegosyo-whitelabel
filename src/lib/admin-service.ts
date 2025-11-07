/**
 * Server-side service layer for tenant admin operations
 * Uses server-side Supabase client with RLS policies
 */

import { createClient } from '@/lib/supabase/server'
import type { Category, MenuItem } from '@/types/database'
import { z } from 'zod'

// ============================================
// Types & Schemas
// ============================================

export const categorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
})

// New variation type schema
export const variationOptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Option name is required'),
  price_modifier: z.number(),
  image_url: z.string().url('Must be a valid URL').optional().nullable(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0),
})

export const variationTypeSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Type name is required'),
  is_required: z.boolean(),
  display_order: z.number().int().min(0),
  options: z.array(variationOptionSchema).min(1, 'At least one option is required'),
})

export const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().positive('Price must be positive'),
  discounted_price: z.number().positive().optional().nullable(),
  image_url: z.string().url('Must be a valid URL'),
  category_id: z.string().uuid('Must select a category'),
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
  order: z.number().int().min(0).default(0),
})

export type CategoryInput = z.infer<typeof categorySchema>
export type MenuItemInput = z.infer<typeof menuItemSchema>

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

  // Check if user is admin of this tenant or superadmin
  const { data: userRoleData, error: roleError } = await supabase
    .from('app_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (roleError || !userRoleData) {
    throw new Error('Unauthorized: User role not found')
  }

  const userRole: { role: string; tenant_id: string | null } = userRoleData

  const isAuthorized = 
    userRole.role === 'superadmin' || 
    (userRole.role === 'admin' && userRole.tenant_id === tenantId)

  if (!isAuthorized) {
    throw new Error('Unauthorized: Not admin of this tenant')
  }

  return { user, userRole }
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

export async function getCategoriesByTenant(tenantId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })

  if (error) throw error
  return data as Category[]
}

export async function createCategory(tenantId: string, input: CategoryInput) {
  await verifyTenantAdmin(tenantId)
  
  const validated = categorySchema.parse(input)
  const supabase = await createClient()

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
  return data as Category
}

export async function updateCategory(categoryId: string, tenantId: string, input: CategoryInput) {
  await verifyTenantAdmin(tenantId)
  
  const validated = categorySchema.parse(input)
  const supabase = await createClient()

  const query = supabase
    .from('categories')
    // @ts-expect-error - Supabase type inference issue with update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(validated as any)
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as Category
}

export async function deleteCategory(categoryId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function reorderCategories(tenantId: string, categoryIds: string[]) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  // Update order for each category
  const updates = categoryIds.map((id, index) => 
    supabase
      .from('categories')
      // @ts-expect-error - Supabase type inference issue with update
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
    return data as MenuItem[]
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
    query = query.or(`name.ilike.%${params.searchQuery}%,description.ilike.%${params.searchQuery}%`)
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
    items: data as MenuItem[],
    totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

export async function getMenuItemById(itemId: string, tenantId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) throw error
  return data as MenuItem
}

export async function createMenuItem(tenantId: string, input: MenuItemInput) {
  await verifyTenantAdmin(tenantId)
  
  const validated = menuItemSchema.parse(input)
  const supabase = await createClient()

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
    } as any)
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}

export async function updateMenuItem(itemId: string, tenantId: string, input: MenuItemInput) {
  await verifyTenantAdmin(tenantId)
  
  const validated = menuItemSchema.parse(input)
  const supabase = await createClient()

  const query = supabase
    .from('menu_items')
    // @ts-expect-error - Supabase type inference issue with update
    .update({
      ...validated,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      variations: validated.variations as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addons: validated.addons as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as MenuItem
}

export async function deleteMenuItem(itemId: string, tenantId: string) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('id', itemId)
    .eq('tenant_id', tenantId)

  if (error) throw error
}

export async function toggleMenuItemAvailability(itemId: string, tenantId: string, isAvailable: boolean) {
  await verifyTenantAdmin(tenantId)
  
  const supabase = await createClient()

  const query = supabase
    .from('menu_items')
    // @ts-expect-error - Supabase type inference issue with update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ is_available: isAvailable } as any)
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .select()
    .single()

  const { data, error } = await query

  if (error) throw error
  return data as MenuItem
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

export async function getTenantBySlug(slug: string) {
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
}

