/**
 * Menu management's list read — just the columns the list renders.
 *
 * The page used `getMenuItemsByTenant` (`*, category:categories(*)`): every
 * dish's variations, add-ons and modifier-group JSON plus a copy of its
 * category, all serialized into the page for a list that shows a photo, a name,
 * a price and a few badges. Categories are already read separately.
 *
 * Adding a field to the row, its badges, the filters or the arrange list means
 * adding it HERE — `AdminMenuListItem` is what those components are typed
 * against, so reading a column this projection omits is a compile error, not a
 * silent `undefined`.
 *
 * Not Redis-cached on purpose: an owner flips availability mid-service and the
 * list must show the switch where they left it.
 */

import type { MenuItem } from '@/types/database'

export const ADMIN_MENU_LIST_COLUMNS = [
  'id',
  'tenant_id',
  'category_id',
  'name',
  'description',
  'price',
  'discounted_price',
  'image_url',
  'is_available',
  // Tells the system's auto-86 apart from the owner's own switch (row badge).
  'auto_disabled_at',
  'is_featured',
  'presell_enabled',
  'order',
] as const satisfies ReadonlyArray<keyof MenuItem>

export type AdminMenuListItem = Pick<MenuItem, (typeof ADMIN_MENU_LIST_COLUMNS)[number]>

const ADMIN_MENU_LIST_SELECT = ADMIN_MENU_LIST_COLUMNS.join(', ')

interface ListQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  eq: (column: string, value: unknown) => ListQuery
  order: (column: string, options: { ascending: boolean }) => ListQuery
}

/** Structural subset of the Supabase client, so this stays unit-testable. */
export interface AdminMenuListClient {
  from: (table: string) => { select: (projection: string) => ListQuery }
}

export async function listAdminMenuItems(
  client: AdminMenuListClient,
  tenantId: string
): Promise<AdminMenuListItem[]> {
  const { data, error } = await client
    .from('menu_items')
    .select(ADMIN_MENU_LIST_SELECT)
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })
    // Ties are common on live stores; `id` keeps this list in the same order
    // the storefront shows (storefront-catalog.ts breaks ties the same way).
    .order('id', { ascending: true })

  if (error) throw error
  return (data ?? []) as AdminMenuListItem[]
}

/** A dish as a price source (the add-on library's "from a menu item"). */
export interface MenuItemPriceRef {
  id: string
  name: string
  price: number
  discounted_price: number | null
}

/**
 * Names and prices only — what the add-on library offers as a price source. It
 * used to read the full menu (every JSON column plus the category) to keep four
 * fields.
 */
export async function listMenuItemPriceRefs(
  client: AdminMenuListClient,
  tenantId: string
): Promise<MenuItemPriceRef[]> {
  const { data, error } = await client
    .from('menu_items')
    .select('id, name, price, discounted_price')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return ((data ?? []) as Array<Omit<MenuItemPriceRef, 'discounted_price'> & { discounted_price?: number | null }>).map(
    (item) => ({ ...item, discounted_price: item.discounted_price ?? null })
  )
}
