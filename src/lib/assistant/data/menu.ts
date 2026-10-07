/**
 * The menu as the assistant reads it: one small projection, read with the
 * service role AFTER the route has authorised the caller for this tenant.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface AssistantMenuItem {
  id: string
  name: string
  price: number
  isAvailable: boolean
  categoryId: string | null
  categoryName: string | null
  createdAt: string | null
}

/** Menus are far below this; the cap keeps a runaway store from a huge read. */
const MENU_READ_LIMIT = 1000

export async function readAssistantMenu(tenantId: string): Promise<AssistantMenuItem[]> {
  const admin = createAdminClient()
  const [items, categories] = await Promise.all([
    admin
      .from('menu_items')
      .select('id, name, price, is_available, category_id, created_at')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
      .limit(MENU_READ_LIMIT),
    admin.from('categories').select('id, name').eq('tenant_id', tenantId).limit(MENU_READ_LIMIT),
  ])
  if (items.error) throw new Error(`Menu could not be read: ${items.error.message}`)

  const categoryNames = new Map((categories.data ?? []).map((row) => [row.id, row.name]))
  return (items.data ?? []).map((row) => ({
    id: row.id,
    name: row.name.trim(),
    price: Number(row.price) || 0,
    isAvailable: row.is_available !== false,
    categoryId: row.category_id ?? null,
    categoryName: (row.category_id && categoryNames.get(row.category_id)?.trim()) || null,
    createdAt: row.created_at ?? null,
  }))
}

export interface AssistantCategory {
  id: string
  name: string
}

export async function readAssistantCategories(tenantId: string): Promise<AssistantCategory[]> {
  const { data, error } = await createAdminClient()
    .from('categories')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
    .limit(MENU_READ_LIMIT)
  if (error) throw new Error(`Categories could not be read: ${error.message}`)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name.trim() }))
}
