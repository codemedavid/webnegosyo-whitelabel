/**
 * A confirmed photo import: create the categories it needs, then the dishes.
 *
 * Runs as the person who tapped Confirm: their permission is checked once
 * (`verifyTenantPermission`, the menu writers' own gate) and every write goes
 * through their RLS-bound session client, exactly like the menu editor. A dish
 * that reached the menu since the proposal is skipped, not doubled; a dish the
 * database refuses is reported without sinking the others.
 */

import 'server-only'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { categorySchema, createCategory, verifyTenantPermission } from '@/lib/admin-service'
import { buildMenuItemRow } from '@/lib/menu-import/import-parsed-menu'
import { revalidateStorefrontMenu } from '@/lib/storefront/revalidate'
import { foldName } from '@/lib/assistant/insights/menu-import'
import type { Database } from '@/types/database'
import type { ExecuteOutcome, MenuImportCategory, MenuImportPayload } from '@/lib/assistant/actions/kinds'
import type { StoreRef } from '@/lib/assistant/actions/execute-manage'

const PAGE_SIZE = 1000
/** Stores have tens of categories; the cap only bounds a runaway read. */
const CATEGORY_LIMIT = 1000

type Client = SupabaseClient<Database>
// The generated row types lag the columns a dish row carries (variation_types, order).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any }

/**
 * Every dish name the store has. Paged past the API's 1000-row cap: a dish
 * missed here would be added a second time.
 */
async function readAllItemNames(client: Client, tenantId: string): Promise<Set<string>> {
  const names = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from('menu_items').select('name').eq('tenant_id', tenantId).order('id').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`menu read failed: ${error.message}`)
    const rows = (data ?? []) as Array<{ name: string }>
    rows.forEach((row) => names.add(foldName(row.name)))
    if (rows.length < PAGE_SIZE) return names
  }
}

async function readStore(client: Client, tenantId: string) {
  const [categories, itemNames] = await Promise.all([
    client.from('categories').select('id, name').eq('tenant_id', tenantId).order('name').limit(CATEGORY_LIMIT),
    readAllItemNames(client, tenantId),
  ])
  if (categories.error) throw new Error(`categories read failed: ${categories.error.message}`)
  return { categories: (categories.data ?? []) as Array<{ id: string; name: string }>, itemNames }
}

/** A parser emoji the storefront cannot render is dropped rather than failing the category. */
function categoryInput(category: MenuImportCategory, order: number) {
  const withIcon = categorySchema.safeParse({ name: category.name, icon: category.icon ?? undefined, order })
  return withIcon.success ? withIcon.data : categorySchema.parse({ name: category.name, order })
}

/** Category name → id for every category the dishes use, creating the missing ones. */
async function ensureCategories(
  client: Client,
  tenantId: string,
  needed: readonly MenuImportCategory[],
  existing: ReadonlyArray<{ id: string; name: string }>,
): Promise<{ ids: Map<string, string>; created: number }> {
  const byFold = new Map(existing.map((row) => [foldName(row.name), row.id]))
  const ids = new Map<string, string>()
  let created = 0
  for (const category of needed) {
    const found = byFold.get(foldName(category.name))
    if (found) {
      ids.set(category.name, found)
      continue
    }
    const row = await createCategory(tenantId, categoryInput(category, existing.length + created), { client })
    ids.set(category.name, row.id)
    byFold.set(foldName(category.name), row.id)
    created += 1
  }
  return { ids, created }
}

/** Where new dishes start in each category: after the ones already there. */
async function nextOrders(client: Client, tenantId: string, categoryIds: readonly string[]): Promise<Map<string, number>> {
  const entries = await Promise.all(
    categoryIds.map(async (categoryId) => {
      const { data, error } = await (client as unknown as LooseClient)
        .from('menu_items')
        .select('order')
        .eq('tenant_id', tenantId)
        .eq('category_id', categoryId)
        .order('order', { ascending: false })
        .limit(1)
      if (error) throw new Error(`menu order read failed: ${error.message}`)
      const top = (data as Array<{ order: number | null }> | null)?.[0]?.order
      return [categoryId, typeof top === 'number' ? top + 1 : 0] as const
    }),
  )
  return new Map(entries)
}

/** Inserts the rows; a refused batch is retried one by one. Returns how many landed. */
async function insertRows(client: Client, rows: readonly unknown[]): Promise<{ inserted: number; failed: string[] }> {
  const loose = client as unknown as LooseClient
  const { error } = await loose.from('menu_items').insert(rows)
  if (!error) return { inserted: rows.length, failed: [] }
  console.error('[assistant] photo import batch refused, retrying row by row', { message: error.message })
  const failed: string[] = []
  for (const row of rows) {
    const single = await loose.from('menu_items').insert(row)
    if (single.error) failed.push((row as { name: string }).name)
  }
  return { inserted: rows.length - failed.length, failed }
}

function outcomeMessage(added: number, newCategories: number, skipped: number, failed: string[]): string {
  const parts = [`Added ${added} dish${added === 1 ? '' : 'es'} to your menu`]
  if (newCategories > 0) parts.push(`with ${newCategories} new categor${newCategories === 1 ? 'y' : 'ies'}`)
  let message = `${parts.join(' ')}.`
  if (skipped > 0) message += ` ${skipped} ${skipped === 1 ? 'was' : 'were'} already on it.`
  if (failed.length > 0) message += ` Could not add: ${failed.slice(0, 5).join(', ')}.`
  return message
}

export async function executeMenuImport(store: StoreRef, payload: MenuImportPayload): Promise<ExecuteOutcome> {
  await verifyTenantPermission(store.id, 'menu')
  const client = await createClient()
  const current = await readStore(client, store.id)

  const fresh = payload.items.filter((item) => !current.itemNames.has(foldName(item.name)))
  if (fresh.length === 0) return { ok: false, error: 'All of these dishes are already on your menu, so nothing was added.' }

  const usedNames = new Set(fresh.map((item) => item.category))
  const { ids, created } = await ensureCategories(client, store.id, payload.categories.filter((c) => usedNames.has(c.name)), current.categories)
  const orders = await nextOrders(client, store.id, [...new Set(ids.values())])

  const stamp = Date.now()
  // Option and add-on ids derive from (stamp, order); orders repeat across
  // categories, so each dish gets its own stamp.
  const rows = fresh.flatMap((item, index) => {
    const categoryId = ids.get(item.category)
    if (!categoryId) return []
    const order = orders.get(categoryId) ?? 0
    orders.set(categoryId, order + 1)
    return [buildMenuItemRow(store.id, categoryId, item, order, stamp + index)]
  })
  const { inserted, failed } = await insertRows(client, rows)

  revalidatePath(`/${store.slug}/admin/menu`)
  revalidateStorefrontMenu(store.slug)
  if (inserted === 0) return { ok: false, error: 'The dishes could not be added. Try adding them in the menu editor.' }
  return {
    ok: true,
    message: outcomeMessage(inserted, created, payload.items.length - fresh.length, failed),
    resultRef: null,
    link: { label: 'Open menu to add photos', path: '/menu' },
  }
}
