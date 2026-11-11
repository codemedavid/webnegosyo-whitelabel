/**
 * Reads the rows `buildDishDirectory` needs, paging past the platform's
 * 1000-row response cap (a big menu must not silently lose dishes).
 */

import { buildDishDirectory, type DirectoryCategoryRow, type DirectoryDishRow, type DishRef } from '@/lib/addon-groups/dish-directory'

const PAGE_SIZE = 1000
/** No real menu is near this; it bounds the loop if the API misbehaves. */
const MAX_PAGES = 10

export interface DishDirectoryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

async function readAllDishes(client: DishDirectoryClient, tenantId: string): Promise<DirectoryDishRow[]> {
  const rows: DirectoryDishRow[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await client
      .from('menu_items')
      .select('id, name, category_id, modifier_groups, variation_types, variations, addons')
      .eq('tenant_id', tenantId)
      .order('order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as DirectoryDishRow[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

export async function readDishDirectory(client: DishDirectoryClient, tenantId: string): Promise<DishRef[]> {
  const [dishes, categories] = await Promise.all([
    readAllDishes(client, tenantId),
    client.from('categories').select('id, name, order').eq('tenant_id', tenantId).then(
      ({ data, error }: { data: unknown; error: unknown }) => {
        if (error) throw error
        return (data ?? []) as DirectoryCategoryRow[]
      }
    ),
  ])
  return buildDishDirectory(dishes, categories)
}
